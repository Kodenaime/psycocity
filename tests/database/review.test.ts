import * as OTPAuth from "otpauth";
import { createAdminService } from "../../apps/api/src/admin/service.js";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applicationPrivacyVersion, applicationTermsVersion, lagosDate } from "@psycocity/validation";
import { createDatabase } from "../../apps/api/src/database.js";
import { testMongoUri } from "../../apps/api/src/config.js";
import { createIdentityModels } from "../../apps/api/src/identity/models.js";
import { createIdentityService } from "../../apps/api/src/identity/service.js";
import { readAuthConfig } from "../../apps/api/src/identity/config.js";
import { createApplicationModels } from "../../apps/api/src/applications/models.js";
import { createOutboxModel } from "../../apps/api/src/mail/models.js";
import { createOutbox } from "../../apps/api/src/mail/outbox.js";
import { localMailSender, type Mail } from "../../apps/api/src/mail/delivery.js";
import { localPrivateStorage, type PrivateStorage } from "../../apps/api/src/media/storage.js";
import { createApp } from "../../apps/api/src/app.js";
import { safeErrorHandler } from "../../apps/api/src/errors.js";
import type { Express } from "express";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated _test database required");
const database = createDatabase(uri); const connection = database.connection.useDb(`submission_${randomUUID().replaceAll("-", "")}_test`);
const identity = createIdentityService(createIdentityModels(connection));
const applications = createApplicationModels(connection);
const key = randomBytes(32); const model = createOutboxModel(connection); const outbox = createOutbox(model, key);
let directory: string; let storage: PrivateStorage; let app: Express; let picture: Buffer;
const sender = async (mail: Mail, key: string) => localMailSender("test", `${directory}/mail`)(mail, key);
const mail = { ...outbox, model, sender };
const origin = "http://localhost:5173"; const common = { Origin: origin, "X-Requested-With": "Psycocity" };
const config = readAuthConfig({ APP_ORIGIN: origin }, "test");
const declarations = { accuracy: true, termsAccepted: true, privacyAccepted: true, termsVersion: applicationTermsVersion, privacyVersion: applicationPrivacyVersion };
const answers = {
  personal: { legalName: "Sample Applicant", birthDate: "2000-01-01", phone: "08012345678" },
  location: { country: "Nigeria", state: "Lagos", city: "Ikeja" },
  measurements: { heightCm: 175, waistCm: 70, shoeSize: 40, shoeSystem: "EU" },
  background: { introduction: "I am ready to develop my modelling craft and professional confidence.", interests: "Editorial and runway", availability: "Weekends", experience: "I have worked on local fashion campaigns." },
  academy: { learningGoals: "Develop my runway and portfolio skills", hybridAvailability: "Weekends in person and online" },
  established: { representationHistory: "Independent", contractualRestrictions: "None" },
};
async function fixture(track: "academy" | "established" = "academy", age?: number) {
  const email = `${randomUUID()}@example.test`;
  const user = await identity.models.User.create({ emailNormalized: email, passwordHash: "internal-session-fixture", emailVerifiedAt: new Date(), roles: ["applicant"] });
  const session = await identity.issueSession(String(user._id));
  const headers = { ...common, Cookie: `psycocity_session=${session.token}`, "X-CSRF-Token": session.csrfToken };
  const created = await request(app).post("/api/v1/applications").set(headers).send({ track }); const id = created.body.id as string;
  const data = structuredClone(answers); if (age) data.personal.birthDate = `${Number(lagosDate().slice(0, 4)) - age}-01-01`;
  await request(app).patch(`/api/v1/applications/${id}`).set(headers).send({ version: 0, answers: data }).expect(200);
  return { id, headers, email };
}
async function photos(who: Awaited<ReturnType<typeof fixture>>) {
  for (const slot of ["headshot", "profile", "full_body_front", "full_body_side"]) {
    const grant = await request(app).post("/api/v1/media/uploads").set(who.headers).send({ applicationId: who.id, slot }); expect(grant.status).toBe(201);
    await request(app).put(grant.body.uploadUrl).set(who.headers).set("X-Upload-Token", grant.body.uploadToken).set("Content-Type", "image/png").send(picture).expect(200);
  }
}
beforeAll(async () => {
  await database.connect(); await mkdir(".cache", { recursive: true }); directory = await mkdtemp(".cache/submission-test-"); storage = localPrivateStorage("test", `${directory}/media`);
  app = createApp({ identityService: identity, authConfig: config, mail, storage, adminKey: key }); app.use(safeErrorHandler);
  for (const value of Object.values(connection.models)) await value.createIndexes();
  picture = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#e7db9d" } }).png().toBuffer();
});
afterAll(async () => {
  try { if (database.connection.readyState === 1) for (const value of Object.values(connection.models)) await value.collection.drop(); }
  finally { await database.close(); if (directory) await rm(directory, { recursive: true, force: true }); }
});


async function staff() {
  const user = await identity.models.User.create({ emailNormalized: `${randomUUID()}@example.test`, passwordHash: "session-fixture", roles: ["admin", "applicant"], staffStatus: "active", emailVerifiedAt: new Date() });
  const service = createAdminService(identity, mail, key, origin);
  const pending = await identity.issueSession(String(user._id)); const actor = (await identity.authenticate(pending.token))!;
  const setup = (await service.enroll(actor))!;
  const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(setup.secret), algorithm: "SHA1", digits: 6, period: 30 }).generate();
  const verified = (await service.verifyMfa(actor, "totp", code))!;
  return { userId: user._id, headers: { ...common, Cookie: `psycocity_session=${verified.session.token}`, "X-CSRF-Token": verified.session.csrfToken } };
}
async function submitted() {
  const who = await fixture(); await photos(who);
  const result = await request(app).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({ version: 1, declarations }).expect(200);
  return { ...who, version: result.body.version as number };
}
describe("staff admissions review and scoped corrections", () => {
  it("isolates draft data and private photos, enforces stale review and preserves resubmission snapshots", async () => {
    const admin = await staff(); const who = await submitted(); const draft = await fixture();
    await request(app).get("/api/v1/admin/applications").set(who.headers).expect(403);
    const queue = await request(app).get("/api/v1/admin/applications?track=academy&minAge=18&maxAge=50").set(admin.headers).expect(200);
    expect(queue.body.items.some((value: {id: string}) => value.id === who.id)).toBe(true);
    expect(queue.body.items.some((value: {id: string}) => value.id === draft.id)).toBe(false);
    const detail = await request(app).get(`/api/v1/admin/applications/${who.id}`).set(admin.headers).expect(200);
    expect(detail.body.photos).toHaveLength(4);
    await request(app).get(detail.body.photos[0].previewUrl).set(admin.headers).expect(200);
    await request(app).get(detail.body.photos[0].previewUrl).set((await fixture()).headers).expect(404);
    await request(app).post(`/api/v1/admin/applications/${who.id}/actions`).set(admin.headers).send({version: who.version, action: "start_review"}).expect(200);
    await request(app).post(`/api/v1/admin/applications/${who.id}/actions`).set(admin.headers).send({version: who.version, action: "shortlist"}).expect(409);
    await request(app).post(`/api/v1/admin/applications/${who.id}/actions`).set(admin.headers).send({version: who.version + 1, action: "request_corrections", fields: ["personal.phone", "photos.headshot"], publicMessage: "Please update your phone and headshot.", internalNote: "PRIVATE review observation"}).expect(200);
    const owner = await request(app).get(`/api/v1/applications/${who.id}`).set(who.headers).expect(200);
    const edited = structuredClone(owner.body.answers); edited.location.city = "Abuja";
    await request(app).patch(`/api/v1/applications/${who.id}`).set(who.headers).send({version: owner.body.version, answers: edited}).expect(403);
    edited.location.city = owner.body.answers.location.city; edited.personal.phone = "08098765432";
    const saved = await request(app).patch(`/api/v1/applications/${who.id}`).set(who.headers).send({version: owner.body.version, answers: edited}).expect(200);
    await request(app).post("/api/v1/media/uploads").set(who.headers).send({applicationId: who.id, slot: "profile"}).expect(403);
    const grant = await request(app).post("/api/v1/media/uploads").set(who.headers).send({applicationId: who.id, slot: "headshot"}).expect(201);
    await request(app).put(grant.body.uploadUrl).set(who.headers).set("X-Upload-Token", grant.body.uploadToken).set("Content-Type", "image/png").send(picture).expect(200);
    const pendingPhotos = await request(app).get(`/api/v1/media/application/${who.id}`).set(who.headers).expect(200);
    const newPhoto = pendingPhotos.body.items.find((value: {slot: string}) => value.slot === "headshot");
    await request(app).get(newPhoto.previewUrl).set(admin.headers).expect(404);
    await request(app).get(newPhoto.previewUrl).set(who.headers).expect(200);
    const pending = await request(app).get(`/api/v1/admin/applications/${who.id}`).set(admin.headers).expect(200);
    expect(pending.body.application.answers.personal.phone).toBe("+2348012345678");
    const timeline = await request(app).get(`/api/v1/applications/${who.id}/timeline`).set(who.headers).expect(200);
    expect(owner.text + timeline.text).not.toContain("PRIVATE review observation");
    await request(app).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({version: saved.body.version, declarations}).expect(200);
    const revisions = await applications.Submission.find({applicationId: who.id}).sort({revision: 1}).lean();
    expect(revisions).toHaveLength(2); expect(revisions[0]!.snapshot.answers.personal.phone).toBe("+2348012345678");
    expect(revisions[1]!.snapshot.answers.personal.phone).toBe("+2348098765432");
    expect(revisions[0]!.snapshot.mediaIds).not.toEqual(revisions[1]!.snapshot.mediaIds);
    const reviewed = await request(app).get(`/api/v1/admin/applications/${who.id}`).set(admin.headers).expect(200);
    expect(reviewed.body.notes[0].body).toBe("PRIVATE review observation");
    expect(reviewed.body.application.answers.personal.phone).toBe("+2348098765432");
    await request(app).get(detail.body.photos[0].previewUrl).set(admin.headers).expect(200);
  });
  it("blocks self review and assessment on consent hold", async () => {
    const admin = await staff(); const who = await submitted();
    await applications.Application.collection.updateOne({_id: new (await import("mongoose")).Types.ObjectId(who.id)}, {$set: {ownerId: admin.userId}});
    await request(app).post(`/api/v1/admin/applications/${who.id}/actions`).set(admin.headers).send({version: who.version, action: "start_review"}).expect(403);
    await request(app).post(`/api/v1/admin/applications/${who.id}/notes`).set(admin.headers).send({version: who.version, body: "Own application note"}).expect(403);
    const other = await submitted();
    await applications.Application.updateOne({_id: other.id}, {$set: {consentHold: true}});
    await request(app).post(`/api/v1/admin/applications/${other.id}/actions`).set(admin.headers).send({version: other.version, action: "shortlist"}).expect(409);
    await request(app).post(`/api/v1/admin/applications/${other.id}/actions`).set(admin.headers).send({version: other.version, action: "request_corrections", fields: ["guardian"], publicMessage: "Please renew guardian consent before review."}).expect(200);
  });
  it("limits guardian changes to requested consent or identity corrections", async () => {
    const who = await fixture("academy", 17);
    await applications.Application.updateOne({_id: who.id}, {$set: {status: "corrections_requested", correctionFields: ["personal.phone"]}});
    const body = {guardianName: "Sample Guardian", email: `${randomUUID()}@example.test`, relationship: "parent"};
    await request(app).post(`/api/v1/applications/${who.id}/guardian/request`).set(who.headers).send(body).expect(403);
    await applications.Application.updateOne({_id: who.id}, {$set: {correctionFields: ["guardian"]}});
    await request(app).post(`/api/v1/applications/${who.id}/guardian/request`).set(who.headers).send(body).expect(202);
  });

});
