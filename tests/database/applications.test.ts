import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../apps/api/src/database.js";
import { testMongoUri } from "../../apps/api/src/config.js";
import { createIdentityModels } from "../../apps/api/src/identity/models.js";
import { createIdentityService } from "../../apps/api/src/identity/service.js";
import { readAuthConfig } from "../../apps/api/src/identity/config.js";
import { createApplicationModels } from "../../apps/api/src/applications/models.js";
import { createApp } from "../../apps/api/src/app.js";
import { safeErrorHandler } from "../../apps/api/src/errors.js";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated _test database required");
const database = createDatabase(uri);
const connection = database.connection.useDb(`applications_${randomUUID().replaceAll("-", "")}_test`);
const models = createIdentityModels(connection);
const identity = createIdentityService(models);
const applicationModels = createApplicationModels(connection);
const origin = "http://localhost:5173";
const config = readAuthConfig({ APP_ORIGIN: origin }, "test");
const app = createApp({ identityService: identity, authConfig: config }); app.use(safeErrorHandler);
let owner: { cookie: string; csrf: string };
let foreign: { cookie: string; csrf: string };
let unverified: { cookie: string; csrf: string };
async function actor(email: string, verified: boolean) {
  const user = await models.User.create({ emailNormalized: email, passwordHash: "internal-non-login-fixture", emailVerifiedAt: verified ? new Date() : undefined, roles: ["applicant"] });
  const session = await identity.issueSession(String(user._id));
  return { cookie: `psycocity_session=${session.token}`, csrf: session.csrfToken };
}
const post = (body: Record<string, unknown>, who = owner) => request(app).post("/api/v1/applications").set("Cookie", who.cookie).set("Origin", origin).set("X-Requested-With", "Psycocity").set("X-CSRF-Token", who.csrf).send(body);
const patch = (id: string, body: Record<string, unknown>, who = owner) => request(app).patch(`/api/v1/applications/${id}`).set("Cookie", who.cookie).set("Origin", origin).set("X-Requested-With", "Psycocity").set("X-CSRF-Token", who.csrf).send(body);
beforeAll(async () => {
  await database.connect();
  for (const value of Object.values(connection.models)) await value.createIndexes();
  owner = await actor("owner@example.test", true); foreign = await actor("foreign@example.test", true); unverified = await actor("unverified@example.test", false);
});
afterAll(async () => {
  try { if (database.connection.readyState === 1) for (const value of Object.values(connection.models)) await value.collection.drop(); }
  finally { await database.close(); }
});

describe("owned versioned application drafts", () => {
  it("requires verified applicant sessions and a valid CSRF token", async () => {
    expect((await request(app).get("/api/v1/applications")).status).toBe(401);
    expect((await post({ track: "academy" }, unverified)).status).toBe(403);
    expect((await request(app).post("/api/v1/applications").set("Cookie", owner.cookie).set("Origin", origin).set("X-Requested-With", "Psycocity").send({ track: "academy" })).status).toBe(403);
  });
  it("creates and resumes a single active draft per track", async () => {
    const first = await post({ track: "academy" }); expect(first.status).toBe(201);
    const again = await post({ track: "academy" }); expect(again.status).toBe(200); expect(again.body.id).toBe(first.body.id);
    const second = await post({ track: "established" }); expect(second.status).toBe(201); expect(second.body.id).not.toBe(first.body.id);
    const list = await request(app).get("/api/v1/applications?limit=1").set("Cookie", owner.cookie);
    expect(list.status).toBe(200); expect(list.body.items).toHaveLength(1); expect(list.body.nextCursor).toBeTruthy();
    const next = await request(app).get(`/api/v1/applications?limit=1&cursor=${list.body.nextCursor}`).set("Cookie", owner.cookie);
    expect(next.body.items).toHaveLength(1); expect(next.body.items[0].id).not.toBe(list.body.items[0].id);
    expect((await request(app).get("/api/v1/applications?limit=101").set("Cookie", owner.cookie)).status).toBe(400);
  });
  it("saves incomplete answers, rejects stale saves and protects state fields", async () => {
    const created = await post({ track: "academy" }); const id = created.body.id as string;
    const saved = await patch(id, { version: created.body.version, answers: { personal: { legalName: "Sample Applicant" }, measurements: { heightCm: 175 } } });
    expect(saved.status).toBe(200); expect(saved.body.version).toBe(created.body.version + 1);
    const stale = await patch(id, { version: created.body.version, answers: {} }); expect(stale.status).toBe(409);
    expect((await patch(id, { version: saved.body.version, answers: {}, status: "accepted" })).status).toBe(400);
    expect((await patch(id, { version: saved.body.version, answers: { measurements: { heightCm: -1 } } })).status).toBe(400);
    expect((await patch(id, { version: saved.body.version, answers: { personal: { birthDate: "2020-02-30" } } })).status).toBe(400);
    const resumed = await request(app).get(`/api/v1/applications/${id}`).set("Cookie", owner.cookie);
    expect(resumed.body.answers.personal.legalName).toBe("Sample Applicant");
    expect(resumed.text).not.toContain("ownerId");
  });
  it("hides foreign records and does not permit track collisions or edits after submission", async () => {
    const created = await post({ track: "academy" }); const id = created.body.id as string;
    expect((await request(app).get(`/api/v1/applications/${id}`).set("Cookie", foreign.cookie)).status).toBe(404);
    expect((await patch(id, { version: created.body.version, answers: {} }, foreign)).status).toBe(404);
    expect((await patch(id, { version: created.body.version, answers: {}, track: "established" })).status).toBe(409);
    const foreignList = await request(app).get("/api/v1/applications").set("Cookie", foreign.cookie); expect(foreignList.body.items).toEqual([]);
    await applicationModels.Application.updateOne({ _id: id }, { $set: { status: "submitted" } });
    expect((await patch(id, { version: created.body.version, answers: {} })).status).toBe(409);
  });
});
