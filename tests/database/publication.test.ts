import { createProfileModels } from "../../apps/api/src/members/profiles-models.js";
import { createMediaModel } from "../../apps/api/src/media/models.js";
import { createMembershipService } from "../../apps/api/src/members/service.js";
import { createMemberModels } from "../../apps/api/src/members/models.js";
import { createSettlementService } from "../../apps/api/src/payments/settlement.js";
import { hashPassword } from "../../apps/api/src/identity/password.js";
import { decryptPayload } from "../../apps/api/src/mail/crypto.js";
import { createPaymentModel } from "../../apps/api/src/payments/models.js";
import { createOfferModel } from "../../apps/api/src/offers/models.js";
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
const database = createDatabase(uri); const connection = database.connection.useDb(`publication_${randomUUID().replaceAll("-", "")}_test`);
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
const password = "a membership test passphrase"; let encoded: string;
beforeAll(async () => {
  encoded = await hashPassword(password); await database.connect(); await mkdir(".cache", { recursive: true }); directory = await mkdtemp(".cache/submission-test-"); storage = localPrivateStorage("test", `${directory}/media`);
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
async function submitted(track: "academy" | "established" = "academy") {
  const who = await fixture(track); await photos(who);
  const result = await request(app).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({ version: 1, declarations }).expect(200);
  return { ...who, version: result.body.version as number };
}

const Offer = createOfferModel(connection);
async function assessed(track: "academy" | "established" = "academy") {
  const admin = await staff(); const who = await submitted(track);
  await request(app).post(`/api/v1/admin/applications/${who.id}/actions`).set(admin.headers).send({version: who.version, action: "start_review"}).expect(200);
  await request(app).post(`/api/v1/admin/applications/${who.id}/actions`).set(admin.headers).send({version: who.version + 1, action: "record_assessment"}).expect(200);
  return {...who, version: who.version + 2, admin};
}
const reason = "Your assessment meets our admission requirements.";

async function accepted(track: "academy" | "established" = "academy") {
  const who = await assessed(track); await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version: who.version, decision: "accept", reason}).expect(200);
  const offer = (await Offer.findOne({applicationId: who.id}).lean())!; return {...who, offer};
}
const Payment = createPaymentModel(connection);

const {Invitation} = createMemberModels(connection); const service = createMembershipService(identity, mail, origin);
async function paid(track: "academy" | "established" = "academy") {
  const who = await accepted(track); await identity.models.User.updateOne({emailNormalized: who.email}, {$set: {passwordHash: encoded}});
  const payment = await Payment.create({offerId: who.offer._id, applicationId: who.id, ownerId: who.offer.ownerId, reference: `psyc_${randomBytes(20).toString("hex")}`, amountKobo: who.offer.amountKobo, currency: "NGN", termsVersion: who.offer.termsVersion, termsAcceptedAt: new Date(), state: "initialized", initializationExpiresAt: new Date()});
  const settle = createSettlementService(identity, {validSignature: () => false, verify: async () => ({id: `${Date.now()}${Math.floor(Math.random() * 10_000)}`, reference: payment.reference, status: "success", amount: payment.amountKobo, currency: "NGN", domain: "test", paid_at: new Date().toISOString(), customer: {email: who.email}, metadata: {applicationId: who.id, offerId: String(who.offer._id)}})}, mail, origin);
  await settle.runOnce(payment.reference); return {...who, payment};
}
async function token(id: string) {
  const invitation = (await Invitation.findOne({entitlementId: id, status: "pending"}).sort({_id: -1}).lean())!;
  const job = (await model.findOne({dedupeKey: `member-invitation:${invitation._id}`}).select("+encryptedPayload").lean())!;
  const message = decryptPayload(job.encryptedPayload!, key) as {text: string}; const raw = new URL(message.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  return {raw, invitation, job};
}
const input = (email: string, raw: string) => ({email, token: raw, password});

async function activated(track: "academy" | "established" = "established") {
  const who = await paid(track); const id = (await service.ensure(who.payment._id))!; const secret = await token(id);
  const response = await request(app).post("/api/v1/member/activate").set(common).send(input(who.email, secret.raw)).expect(200);
  const cookies = response.headers["set-cookie"] as unknown as string[]; const cookie = cookies.map(value => value.split(";")[0]).join("; "); const csrf = cookies.find(value => value.startsWith("psycocity_csrf="))!.split(";")[0]!.split("=")[1]!;
  return {...who, headers: {...common, Cookie: cookie, "X-CSRF-Token": csrf}, type: track === "academy" ? "student" : "model"};
}
const professional = {professionalName: "Portfolio Sample", bio: "An editorial and commercial model working across Nigeria.", city: "Ikeja", state: "Lagos", gender: "unspecified", categories: ["editorial"], heightCm: 175, shoeSizeEU: 40};

const {Revision, Draft} = createProfileModels(connection); const Media = createMediaModel(connection);
async function upload(who: Awaited<ReturnType<typeof activated>>) {
  const grant = await request(app).post("/api/v1/member/portfolio/uploads").set(who.headers).send({}).expect(201);
  await request(app).put(grant.body.uploadUrl).set(who.headers).set("X-Upload-Token", grant.body.uploadToken).set("Content-Type", "image/png").send(picture).expect(200); return grant;
}

async function submittedPortfolio() {
  const who = await activated(); const draft = await request(app).get("/api/v1/member/model/professional").set(who.headers).expect(200); const first = await upload(who); const second = await upload(who);
  const photos = [first, second].map((value, index) => ({id: value.body.assetId, alt: `Professional fixture ${index}`, credit: "Fixture photographer"}));
  const payload = {version: 0, data: professional, photos, coverId: photos[0]!.id}; await request(app).patch("/api/v1/member/model/professional").set(who.headers).send(payload).expect(200);
  await request(app).post("/api/v1/member/portfolio/submit").set(who.headers).send({version: 1}).expect(200);
  const revision = (await Revision.findOne({memberId: draft.body.memberId}).lean())!; return {...who, revision, payload};
}
describe("immutable moderation and public-safe model catalogue", () => {
  it("publishes an exact revision, preserves it through rejection and hides every public image immediately", async () => {
    const who = await submittedPortfolio(); const id = String(who.revision.memberId); const path = `/api/v1/admin/portfolios/${who.revision._id}/review`;
    expect((await request(app).get("/api/v1/models")).body.items).toHaveLength(0); await request(app).get(`/api/v1/models/${id}`).expect(404);
    await request(app).post(path).set(who.admin.headers).send({publicationVersion: 0, action: "approve_publish", reason: "Approved for the public agency catalogue."}).expect(200);
    await request(app).post(path).set(who.admin.headers).send({publicationVersion: 0, action: "approve_publish", reason: "Stale review must not override publication."}).expect(409);
    const published = await request(app).get(`/api/v1/models/${id}`).expect(200); expect(published.headers["cache-control"]).toBe("no-store"); expect(published.body.professionalName).toBe(professional.professionalName);
    for (const key of ["birthDate", "emailNormalized", "passwordHash", "ownerId", "phone", "address"]) expect(published.text).not.toContain(key);
    const photo = published.body.photos[0]; await request(app).get(photo.url).expect(200); expect((await request(app).get("/api/v1/models?category=fitness")).body.items).toHaveLength(0);
    await request(app).patch("/api/v1/member/model/professional").set(who.headers).send({...who.payload, version: 1, data: {...professional, professionalName: "Unapproved alternative"}}).expect(200);
    await request(app).post("/api/v1/member/portfolio/submit").set(who.headers).send({version: 2}).expect(200); const latest = (await Revision.findOne({memberId: id, revision: 2}).lean())!;
    await request(app).post(`/api/v1/admin/portfolios/${latest._id}/review`).set(who.admin.headers).send({publicationVersion: 1, action: "reject", reason: "Please provide a revised biography first."}).expect(200);
    expect((await request(app).get(`/api/v1/models/${id}`)).body.professionalName).toBe(professional.professionalName);
    await request(app).post(path).set(who.admin.headers).send({publicationVersion: 2, action: "hide", reason: "Temporarily hide this agency listing."}).expect(200);
    await request(app).get(`/api/v1/models/${id}`).expect(404); await request(app).get(photo.url).expect(404); await request(app).get("/api/v1/member/model/published").set(who.headers).expect(200);
    await request(app).post(path).set(who.admin.headers).send({publicationVersion: 3, action: "unhide", reason: "Restore the previously approved agency listing."}).expect(200);
    await request(app).get(`/api/v1/models/${id}`).expect(200);
    await request(app).post(path).set(who.admin.headers).send({publicationVersion: 4, action: "suspend_login", reason: "Account suspension requires agency follow-up."}).expect(200);
    await request(app).get(`/api/v1/models/${id}`).expect(404); await request(app).get("/api/v1/member/me").set(who.headers).expect(401);
    expect((await Draft.findOne({memberId: id}).lean())?.visible).toBe(false); expect((await Media.findById(photo.id).lean())?.retainedForSubmission).toBe(true);
  });
  it("rejects ineligible age and rolls back moderation if notification enqueue fails", async () => {
    const who = await submittedPortfolio(); const path = `/api/v1/admin/portfolios/${who.revision._id}/review`; const body = {publicationVersion: 0, action: "approve_publish", reason: "The submitted portfolio meets review requirements."};
    const failing = createApp({identityService: identity, authConfig: config, adminKey: key, storage, mail: {...mail, enqueue: async () => {throw new Error("Synthetic portfolio email outage");}}}); failing.use(safeErrorHandler);
    await request(failing).post(path).set(who.admin.headers).send(body).expect(409); expect((await Revision.findById(who.revision._id).lean())?.status).toBe("pending");
    const birth = `${Number(lagosDate().slice(0,4)) - 17}-01-01`; await applications.Application.updateOne({_id: who.id}, {$set: {"answers.personal.birthDate": birth, "submittedSnapshot.answers.personal.birthDate": birth}});
    await request(app).post(path).set(who.admin.headers).send(body).expect(409);
  });
});
