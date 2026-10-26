import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardianPolicyVersion, lagosDate } from "@psycocity/validation";
import { createDatabase } from "../../apps/api/src/database.js";
import { testMongoUri } from "../../apps/api/src/config.js";
import { createIdentityModels } from "../../apps/api/src/identity/models.js";
import { createIdentityService } from "../../apps/api/src/identity/service.js";
import { readAuthConfig } from "../../apps/api/src/identity/config.js";
import { createOutboxModel } from "../../apps/api/src/mail/models.js";
import { createOutbox } from "../../apps/api/src/mail/outbox.js";
import { localMailSender, type Mail } from "../../apps/api/src/mail/delivery.js";
import { localPrivateStorage } from "../../apps/api/src/media/storage.js";
import { createGuardianModel } from "../../apps/api/src/guardian/models.js";
import { createApp } from "../../apps/api/src/app.js";
import { safeErrorHandler } from "../../apps/api/src/errors.js";
import type { Express } from "express";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated _test database required");
const database = createDatabase(uri); const connection = database.connection.useDb(`guardian_${randomUUID().replaceAll("-", "")}_test`);
const identity = createIdentityService(createIdentityModels(connection));
const model = createOutboxModel(connection); const guardian = createGuardianModel(connection);
const outbox = createOutbox(model, randomBytes(32));
const origin = "http://localhost:5173"; const common = { Origin: origin, "X-Requested-With": "Psycocity" };
let directory: string; let app: Express;
const sender = async (mail: Mail, key: string) => localMailSender("test", `${directory}/mail`)(mail, key);
const publicPost = (path: string, body: Record<string, unknown>) => request(app).post(`/api/v1/guardian/${path}`).set(common).send(body);
async function fixture() {
  const user = await identity.models.User.create({ emailNormalized: `${randomUUID()}@example.test`, passwordHash: "internal-session-fixture", emailVerifiedAt: new Date(), roles: ["applicant"] });
  const session = await identity.issueSession(String(user._id));
  const headers = { ...common, Cookie: `psycocity_session=${session.token}`, "X-CSRF-Token": session.csrfToken };
  const application = await request(app).post("/api/v1/applications").set(headers).send({ track: "academy" });
  const id = application.body.id as string;
  await request(app).patch(`/api/v1/applications/${id}`).set(headers).send({ version: 0, answers: { personal: { legalName: "Sample Minor", birthDate: `${Number(lagosDate().slice(0, 4)) - 17}-01-01` } } }).expect(200);
  const email = `guardian-${randomUUID()}@example.test`;
  return { id, headers, email };
}
async function invite(who: Awaited<ReturnType<typeof fixture>>) {
  await request(app).post(`/api/v1/applications/${who.id}/guardian/request`).set(who.headers).send({ guardianName: "Sample Guardian", email: who.email, relationship: "parent" }).expect(202);
  return emailToken(who.email, "Guardian consent for");
}
async function emailToken(email: string, subject: string) {
  while (await outbox.runOnce(sender)) { /* Only this suite's isolated jobs. */ }
  for (const file of await readdir(`${directory}/mail`)) {
    const mail = JSON.parse(await readFile(`${directory}/mail/${file}`, "utf8")) as Mail;
    if (mail.to === email && mail.subject.includes(subject)) return new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  }
  throw new Error("Expected guardian email was not delivered locally");
}
const consentBody = (token: string) => ({ token, guardianName: "Confirmed Guardian", relationship: "parent", adult: true, agrees: true, policyVersion: guardianPolicyVersion });
beforeAll(async () => {
  await database.connect(); await mkdir(".cache", { recursive: true }); directory = await mkdtemp(".cache/guardian-test-");
  app = createApp({ identityService: identity, authConfig: readAuthConfig({ APP_ORIGIN: origin }, "test"), mail: { ...outbox, model, sender }, storage: localPrivateStorage("test", `${directory}/media`) }); app.use(safeErrorHandler);
  for (const value of Object.values(connection.models)) await value.createIndexes();
});
afterAll(async () => {
  try { if (database.connection.readyState === 1) for (const value of Object.values(connection.models)) await value.collection.drop(); }
  finally { await database.close(); if (directory) await rm(directory, { recursive: true, force: true }); }
});

describe("guardian email proof and purpose-bound consent", () => {
  it("blocks collection until an explicit verified decision and prevents token replay/login", async () => {
    const who = await fixture();
    const before = await request(app).get(`/api/v1/applications/${who.id}/guardian`).set(who.headers); expect(before.body.canUpload).toBe(false);
    expect((await request(app).post("/api/v1/media/uploads").set(who.headers).send({ applicationId: who.id, slot: "headshot" })).status).toBe(403);
    const token = await invite(who);
    const preview = await publicPost("preview", { token, purpose: "consent" }); expect(preview.status).toBe(200);
    expect(Object.keys(preview.body).sort()).toEqual(["applicantName", "guardianName", "policyVersion", "relationship"]);
    expect((await guardian.findOne({ applicationId: who.id }).lean())?.status).toBe("pending");
    expect((await publicPost("consent", { ...consentBody(token), adult: false })).status).toBe(400);
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", `psycocity_session=${token}`)).status).toBe(401);
    expect((await publicPost("consent", consentBody(token))).status).toBe(200);
    expect((await publicPost("consent", consentBody(token))).status).toBe(400);
    const ready = await request(app).get(`/api/v1/applications/${who.id}/guardian`).set(who.headers); expect(ready.body.canUpload).toBe(true);
    const evidence = await guardian.findOne({ applicationId: who.id }).lean(); expect(evidence?.verifiedAt).toBeInstanceOf(Date); expect(evidence?.policyVersion).toBe(guardianPolicyVersion);
    const grant = await request(app).post("/api/v1/media/uploads").set(who.headers).send({ applicationId: who.id, slot: "headshot" }); expect(grant.status).toBe(201);
    const withdrawal = await emailToken(who.email, "guardian consent record");
    expect((await publicPost("withdraw", { token })).status).toBe(400);
    expect((await publicPost("withdraw", { token: withdrawal })).status).toBe(200);
    const blocked = await request(app).get(`/api/v1/applications/${who.id}/guardian`).set(who.headers); expect(blocked.body.canUpload).toBe(false); expect(blocked.body.status).toBe("withdrawn");
    const png = await sharp({ create: { width: 320, height: 480, channels: 3, background: "white" } }).png().toBuffer();
    expect((await request(app).put(grant.body.uploadUrl).set(who.headers).set("X-Upload-Token", grant.body.uploadToken).set("Content-Type", "image/png").send(png)).status).toBe(403);
    const application = await request(app).get(`/api/v1/applications/${who.id}`).set(who.headers); expect(application.body.consentHold).toBe(true);
  });
  it("invalidates consent when bound applicant details change", async () => {
    const who = await fixture(); const token = await invite(who); await publicPost("consent", consentBody(token)).expect(200);
    await request(app).patch(`/api/v1/applications/${who.id}`).set(who.headers).send({ version: 1, answers: { personal: { legalName: "Changed Applicant", birthDate: `${Number(lagosDate().slice(0, 4)) - 17}-01-01` } } }).expect(200);
    const status = await request(app).get(`/api/v1/applications/${who.id}/guardian`).set(who.headers); expect(status.body.status).toBe("changed"); expect(status.body.canUpload).toBe(false);
  });
  it("rejects expired links and foreign owner access, without erasing evidence", async () => {
    const who = await fixture(); const token = await invite(who);
    await guardian.updateOne({ applicationId: who.id }, { $set: { expiresAt: new Date(0) } });
    expect((await publicPost("preview", { token, purpose: "consent" })).status).toBe(400);
    expect((await publicPost("consent", consentBody(token))).status).toBe(400);
    expect(await guardian.countDocuments({ applicationId: who.id })).toBe(1);
    const other = await fixture(); expect((await request(app).get(`/api/v1/applications/${who.id}/guardian`).set(other.headers)).status).toBe(404);
    expect((await request(app).get(`/api/v1/applications/${who.id}/guardian`).set(who.headers)).body.status).toBe("expired");
  });
  it("allows a guardian to decline without granting any collection permission", async () => {
    const who = await fixture(); const token = await invite(who);
    await publicPost("decline", { token }).expect(200);
    const status = await request(app).get(`/api/v1/applications/${who.id}/guardian`).set(who.headers); expect(status.body.status).toBe("declined"); expect(status.body.canUpload).toBe(false);
  });
});
