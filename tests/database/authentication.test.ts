import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../apps/api/src/database.js";
import { testMongoUri } from "../../apps/api/src/config.js";
import { createIdentityModels, ensureIdentityIndexes } from "../../apps/api/src/identity/models.js";
import { createIdentityService } from "../../apps/api/src/identity/service.js";
import { hashPassword } from "../../apps/api/src/identity/password.js";
import { createOutboxModel } from "../../apps/api/src/mail/models.js";
import { createOutbox } from "../../apps/api/src/mail/outbox.js";
import { localMailSender, type Mail } from "../../apps/api/src/mail/delivery.js";
import { createAuthService } from "../../apps/api/src/identity/auth-service.js";
import { createRateLimitModel } from "../../apps/api/src/identity/rate-limit.js";
import { readAuthConfig } from "../../apps/api/src/identity/config.js";
import { createApp } from "../../apps/api/src/app.js";
import { safeErrorHandler } from "../../apps/api/src/errors.js";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated _test database required");
const database = createDatabase(uri);
const connection = database.connection.useDb(`auth_${randomUUID().replaceAll("-", "")}_test`);
const models = createIdentityModels(connection);
const identity = createIdentityService(models);
const model = createOutboxModel(connection);
const outbox = createOutbox(model, randomBytes(32));
let directory: string;
const sender = async (mail: Mail, key: string) => localMailSender("test", directory)(mail, key);
const mail = { ...outbox, model, sender };
const origin = "http://127.0.0.1:3101";
const config = readAuthConfig({ APP_ORIGIN: origin }, "test");
const app = createApp({ identityService: identity, mail, authConfig: config }); app.use(safeErrorHandler);
const password = "a unique test-only passphrase";
const ownerEmail = "owner@example.test";
const post = (path: string, body: Record<string, unknown>) => request(app).post(`/api/v1/auth/${path}`).set("Origin", origin).set("X-Requested-With", "Psycocity").send(body);
function credentials(response: request.Response) {
  const cookies = response.headers["set-cookie"] as unknown as string[];
  return { cookie: cookies.map(value => value.split(";")[0]).join("; "), csrf: cookies.find(value => value.startsWith("psycocity_csrf="))!.split(";")[0]!.split("=")[1]! };
}
async function deliveredLink(email: string, subject: string) {
  while (await outbox.runOnce(sender)) { /* Drain only this suite's isolated outbox. */ }
  for (const file of await readdir(directory)) {
    const value = JSON.parse(await readFile(`${directory}/${file}`, "utf8")) as Mail;
    if (value.to === email && value.subject.includes(subject)) return new URL(value.text.match(/https?:\/\/\S+/)![0]);
  }
  throw new Error("Expected local email was not delivered");
}
beforeAll(async () => {
  await database.connect();
  await ensureIdentityIndexes(models); await model.createIndexes(); await createRateLimitModel(connection).createIndexes();
  await mkdir(".cache", { recursive: true }); directory = await mkdtemp(".cache/auth-mail-");
  const encoded = await hashPassword(password);
  for (const email of [ownerEmail, "reset-owner@example.test", "production-cookie@example.test"]) await models.User.create({ emailNormalized: email, passwordHash: encoded, roles: ["applicant"], emailVerifiedAt: new Date() });
});
afterAll(async () => {
  try { if (database.connection.readyState === 1) for (const value of Object.values(connection.models)) await value.collection.drop(); }
  finally { await database.close(); if (directory) await rm(directory, { recursive: true, force: true }); }
});

describe("integrated applicant authentication", () => {
  it("registers transactionally, responds generically and consumes email verification once", async () => {
    const email = "new-applicant@example.test";
    const first = await post("register", { email, password });
    const repeated = await post("register", { email, password });
    expect(first.status).toBe(202); expect(repeated.status).toBe(202); expect(first.body).toEqual(repeated.body);
    expect((await models.User.findOne({ emailNormalized: email }).lean())?.roles).toEqual(["applicant"]);
    expect(await model.countDocuments()).toBe(1);
    const link = await deliveredLink(email, "Verify");
    expect((await post("verify-email", { token: link.searchParams.get("token") })).status).toBe(200);
    expect((await post("verify-email", { token: link.searchParams.get("token") })).status).toBe(400);
    expect((await models.User.findOne({ emailNormalized: email }).lean())?.emailVerifiedAt).toBeInstanceOf(Date);
  });
  it("rolls back registration when its durable email cannot be queued", async () => {
    const failing = createAuthService(identity, { ...mail, enqueue: async () => { throw new Error("queue unavailable"); } }, origin);
    await expect(failing.register("rolled-back@example.test", password)).rejects.toThrow("queue unavailable");
    expect(await models.User.exists({ emailNormalized: "rolled-back@example.test" })).toBeNull();
  });
  it("rejects cross-site requests, role injection and unsupported request bodies", async () => {
    expect((await request(app).post("/api/v1/auth/login").set("Origin", "https://attacker.example").set("X-Requested-With", "Psycocity").send({ identifier: ownerEmail, password })).status).toBe(403);
    expect((await request(app).post("/api/v1/auth/login").send({ identifier: ownerEmail, password })).status).toBe(403);
    expect((await post("register", { email: "role-injection@example.test", password, roles: ["admin"] })).status).toBe(400);
    const malformed = await request(app).post("/api/v1/auth/login").set("Origin", origin).set("X-Requested-With", "Psycocity").set("Content-Type", "application/json").send("{malformed");
    expect(malformed.status).toBe(400); expect(malformed.text).not.toContain("malformed");
  });
  it("uses equivalent safe login errors for unknown accounts and wrong passwords", async () => {
    const absent = await post("login", { identifier: "unknown@example.test", password });
    const wrong = await post("login", { identifier: ownerEmail, password: "wrong" });
    expect(absent.status).toBe(401); expect(wrong.status).toBe(401);
    expect(absent.body.error.message).toBe(wrong.body.error.message);
  });
  it("requires the session CSRF token for logout and revokes server-side access", async () => {
    const login = await post("login", { identifier: ownerEmail, password }); expect(login.status).toBe(200);
    const { cookie, csrf } = credentials(login);
    expect((await post("logout", {}).set("Cookie", cookie)).status).toBe(403);
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", cookie)).status).toBe(200);
    expect((await post("logout", {}).set("Cookie", cookie).set("X-CSRF-Token", csrf)).status).toBe(200);
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", cookie)).status).toBe(401);
  });
  it("resets once, enforces token purpose and invalidates existing sessions", async () => {
    const ownerEmail = "reset-owner@example.test";
    const login = await post("login", { identifier: ownerEmail, password }); const { cookie } = credentials(login);
    const known = await post("forgot-password", { email: ownerEmail });
    const absent = await post("forgot-password", { email: "not-an-account@example.test" });
    expect(known.status).toBe(202); expect(absent.body).toEqual(known.body);
    const link = await deliveredLink(ownerEmail, "Reset"); const token = link.searchParams.get("token");
    expect((await post("verify-email", { token })).status).toBe(400);
    const replacement = "replacement test-only passphrase";
    expect((await post("reset-password", { token, password: replacement })).status).toBe(200);
    expect((await post("reset-password", { token, password: replacement })).status).toBe(400);
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", cookie)).status).toBe(401);
    expect((await post("login", { identifier: ownerEmail, password })).status).toBe(401);
    expect((await post("login", { identifier: ownerEmail, password: replacement })).status).toBe(200);
  });
  it("disables registration by default in production and marks session cookies secure", async () => {
    const production = createApp({ identityService: identity, mail: null, authConfig: readAuthConfig({ APP_ORIGIN: "https://agency.example" }, "production") });
    const capabilities = await request(production).get("/api/v1/auth/capabilities");
    expect(capabilities.body).toEqual({ registrationAvailable: false, testMode: false });
    const denied = await request(production).post("/api/v1/auth/register").set("Origin", "https://agency.example").set("X-Requested-With", "Psycocity").send({ email: "disabled@example.test", password });
    expect(denied.status).toBe(503);
    expect(await models.User.exists({ emailNormalized: "disabled@example.test" })).toBeNull();
    const login = await request(production).post("/api/v1/auth/login").set("Origin", "https://agency.example").set("X-Requested-With", "Psycocity").send({ identifier: "production-cookie@example.test", password });
    expect(login.status).toBe(200);
    const cookies = login.headers["set-cookie"] as unknown as string[];
    expect(cookies.find(value => value.startsWith("psycocity_session="))).toMatch(/HttpOnly.*Secure.*SameSite=Lax/);
  });
  it("rate-limits repeated email requests with a safe 429", async () => {
    let response: request.Response | undefined;
    for (let i = 0; i < 12; i++) response = await post("resend-verification", { email: "missing@example.test" });
    expect(response?.status).toBe(429); expect(response?.body.error.code).toBe("RATE_LIMITED"); expect(response?.headers["retry-after"]).toBe("900");
  });
});
