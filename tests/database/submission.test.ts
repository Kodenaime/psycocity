import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applicationPrivacyVersion, applicationTermsVersion, guardianPolicyVersion, lagosDate } from "@psycocity/validation";
import { createDatabase } from "../../apps/api/src/database.js";
import { testMongoUri } from "../../apps/api/src/config.js";
import { createIdentityModels } from "../../apps/api/src/identity/models.js";
import { createIdentityService } from "../../apps/api/src/identity/service.js";
import { readAuthConfig } from "../../apps/api/src/identity/config.js";
import { createApplicationModels } from "../../apps/api/src/applications/models.js";
import { createOutboxModel } from "../../apps/api/src/mail/models.js";
import { createOutbox } from "../../apps/api/src/mail/outbox.js";
import { localMailSender, type Mail } from "../../apps/api/src/mail/delivery.js";
import { createMediaModel } from "../../apps/api/src/media/models.js";
import { localPrivateStorage, type PrivateStorage } from "../../apps/api/src/media/storage.js";
import { cleanOrphanedMedia } from "../../apps/api/src/media/cleanup-service.js";
import { createApp } from "../../apps/api/src/app.js";
import { safeErrorHandler } from "../../apps/api/src/errors.js";
import type { Express } from "express";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated _test database required");
const database = createDatabase(uri); const connection = database.connection.useDb(`submission_${randomUUID().replaceAll("-", "")}_test`);
const identity = createIdentityService(createIdentityModels(connection));
const applications = createApplicationModels(connection); const Media = createMediaModel(connection);
const model = createOutboxModel(connection); const outbox = createOutbox(model, randomBytes(32));
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
async function emailToken(email: string, subject: string) {
  while (await outbox.runOnce(sender)) { /* Drain this suite's owned jobs. */ }
  for (const file of await readdir(`${directory}/mail`)) {
    const value = JSON.parse(await readFile(`${directory}/mail/${file}`, "utf8")) as Mail;
    if (value.to === email && value.subject.includes(subject)) return new URL(value.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  }
  throw new Error("Expected guardian request was not delivered");
}
beforeAll(async () => {
  await database.connect(); await mkdir(".cache", { recursive: true }); directory = await mkdtemp(".cache/submission-test-"); storage = localPrivateStorage("test", `${directory}/media`);
  app = createApp({ identityService: identity, authConfig: config, mail, storage }); app.use(safeErrorHandler);
  for (const value of Object.values(connection.models)) await value.createIndexes();
  picture = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#e7db9d" } }).png().toBuffer();
});
afterAll(async () => {
  try { if (database.connection.readyState === 1) for (const value of Object.values(connection.models)) await value.collection.drop(); }
  finally { await database.close(); if (directory) await rm(directory, { recursive: true, force: true }); }
});

describe("free immutable application submission", () => {
  it.each(["academy", "established"] as const)("submits the %s track without payment and handles retries once", async track => {
    const who = await fixture(track); await photos(who);
    expect((await request(app).get(`/api/v1/applications/${who.id}/requirements`).set(who.headers)).body.canSubmit).toBe(true);
    const submit = () => request(app).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({ version: 1, declarations });
    const first = await submit(); expect(first.status).toBe(200); expect(first.body.status).toBe("submitted"); expect(first.body.submittedAt).toBeTruthy();
    const again = await submit(); expect(again.status).toBe(200); expect(again.body.version).toBe(first.body.version);
    expect(await applications.Submission.countDocuments({ applicationId: who.id })).toBe(1);
    expect(await applications.Transition.countDocuments({ applicationId: who.id, to: "submitted" })).toBe(1);
    expect(await model.countDocuments({ dedupeKey: { $regex: `^application-submitted:${who.id}:` } })).toBe(1);
    const snapshot = await applications.Submission.findOne({ applicationId: who.id }).lean();
    expect(snapshot?.snapshot.answers.personal.phone).toBe("+2348012345678"); expect(snapshot?.snapshot.mediaIds).toHaveLength(4);
    expect((await request(app).patch(`/api/v1/applications/${who.id}`).set(who.headers).send({ version: first.body.version, answers: {} })).status).toBe(409);
    expect((await applications.Submission.findOne({ applicationId: who.id }).lean())?.snapshot.answers.personal.legalName).toBe("Sample Applicant");
    const history = await request(app).get(`/api/v1/applications/${who.id}/timeline`).set(who.headers); expect(history.body.items).toHaveLength(1); expect(history.text).not.toContain("actorId");
  });
  it("reports missing photos, underage eligibility and missing declarations without changing the draft", async () => {
    const who = await fixture("established", 17);
    const invalid = await request(app).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({ version: 1, declarations });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.details.some((item: { path: string }) => item.path === "answers.personal.birthDate")).toBe(true);
    expect(invalid.body.error.details.some((item: { path: string }) => item.path === "photos.headshot")).toBe(true);
    expect((await request(app).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({ version: 1, declarations: { ...declarations, accuracy: false } })).status).toBe(400);
    expect(await applications.Submission.countDocuments({ applicationId: who.id })).toBe(0);
    expect((await applications.Application.findById(who.id).lean())?.status).toBe("draft");
  });
  it("requires and snapshots genuine guardian consent for a minor academy applicant", async () => {
    const who = await fixture("academy", 17); const guardianEmail = `${randomUUID()}@example.test`;
    const missing = await request(app).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({ version: 1, declarations }); expect(missing.status).toBe(422);
    expect(missing.body.error.details.some((item: { path: string }) => item.path === "guardian")).toBe(true);
    await request(app).post(`/api/v1/applications/${who.id}/guardian/request`).set(who.headers).send({ guardianName: "Sample Guardian", email: guardianEmail, relationship: "parent" }).expect(202);
    const token = await emailToken(guardianEmail, "Guardian consent for");
    await request(app).post("/api/v1/guardian/consent").set(common).send({ token, guardianName: "Confirmed Guardian", relationship: "parent", adult: true, agrees: true, policyVersion: guardianPolicyVersion }).expect(200);
    await photos(who);
    await request(app).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({ version: 1, declarations }).expect(200);
    const snapshot = await applications.Submission.findOne({ applicationId: who.id }).lean(); expect(snapshot?.snapshot.guardianConsentId).toMatch(/^[0-9a-f]{24}$/);
  });
  it("rolls back a submission when notification enqueue fails", async () => {
    const who = await fixture(); await photos(who);
    const failing = createApp({ identityService: identity, authConfig: config, mail: { ...mail, enqueue: async () => { throw new Error("Synthetic queue failure"); } }, storage }); failing.use(safeErrorHandler);
    expect((await request(failing).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({ version: 1, declarations })).status).toBe(500);
    expect((await applications.Application.findById(who.id).lean())?.status).toBe("draft"); expect(await applications.Submission.countDocuments({ applicationId: who.id })).toBe(0);
    expect(await Media.countDocuments({ applicationId: who.id, retainedForSubmission: true })).toBe(0);
  });
  it("withdraws idempotently without deleting the submission or referenced photos", async () => {
    const who = await fixture(); await photos(who);
    const submitted = await request(app).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({ version: 1, declarations }); expect(submitted.status).toBe(200);
    const asset = await Media.findOne({ applicationId: who.id, active: true }).lean();
    await Media.updateOne({ _id: asset!._id }, { $set: { active: false } });
    await cleanOrphanedMedia(Media, storage, new Date(Date.now() + 1000));
    expect((await storage.read(asset!.storageKey, "image")).length).toBeGreaterThan(0);
    const withdrew = await request(app).post(`/api/v1/applications/${who.id}/withdraw`).set(who.headers).send({ version: submitted.body.version }); expect(withdrew.status).toBe(200); expect(withdrew.body.status).toBe("withdrawn");
    expect((await request(app).post(`/api/v1/applications/${who.id}/withdraw`).set(who.headers).send({ version: submitted.body.version })).status).toBe(200);
    expect(await applications.Submission.countDocuments({ applicationId: who.id })).toBe(1);
    expect(await applications.Transition.countDocuments({ applicationId: who.id, to: "withdrawn" })).toBe(1);
    expect((await request(app).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({ version: withdrew.body.version, declarations })).status).toBe(409);
  });
});
