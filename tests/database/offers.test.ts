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
const database = createDatabase(uri); const connection = database.connection.useDb(`offers_${randomUUID().replaceAll("-", "")}_test`);
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
describe("immutable admission offers", () => {
  it.each(["academy", "established"] as const)("accepts %s with the correct server fee and private immutable terms", async track => {
    const who = await assessed(track);
    const decide = () => request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version: who.version, decision: "accept", reason});
    const results = await Promise.all([decide(), decide()]); expect(results.map(value => value.status).sort()).toEqual([200, 409]);
    const response = await request(app).get(`/api/v1/applications/${who.id}/offers`).set(who.headers).expect(200);
    expect(response.body.items).toHaveLength(1); const offer = response.body.items[0];
    expect(offer.amountKobo).toBe(track === "academy" ? 5_000_000 : 3_000_000); expect(offer.currency).toBe("NGN"); expect(offer.eligibleForCheckout).toBe(true); expect(response.body.defaultDeadlineDays).toBe(14);
    expect(Date.parse(offer.expiresAt) - Date.parse(offer.issuedAt)).toBeGreaterThan(13 * 24 * 60 * 60_000);
    await request(app).get(`/api/v1/applications/${who.id}/offers`).set((await fixture()).headers).expect(404);
    await request(app).patch(`/api/v1/applications/${who.id}`).set(who.headers).send({version: who.version + 1, track: track === "academy" ? "established" : "academy", answers}).expect(409);
    await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version: who.version + 1, decision: "renew", reason}).expect(409);
    await Offer.updateOne({_id: offer.id}, {$set: {amountKobo: 1, termsText: "Replacement", expiresAt: new Date(0)}});
    const stored = await Offer.findById(offer.id).lean(); expect(stored?.amountKobo).toBe(offer.amountKobo); expect(stored?.termsText).toBe(offer.termsText); expect(stored?.expiresAt.toISOString()).toBe(offer.expiresAt);
  });
  it("renews an expired offer once while preserving prior fee and terms evidence", async () => {
    const who = await assessed();
    await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version: who.version, decision: "accept", reason, deadlineDays: 2}).expect(200);
    const previous = (await Offer.findOne({applicationId: who.id}).lean())!;
    await Offer.collection.updateOne({_id: previous._id}, {$set: {expiresAt: new Date(Date.now() - 1000)}});
    expect((await request(app).get(`/api/v1/applications/${who.id}/offers`).set(who.headers)).body.items[0]).toMatchObject({status: "expired", eligibleForCheckout: false});
    const renew = () => request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version: who.version + 1, decision: "renew", reason, deadlineDays: 7});
    expect((await Promise.all([renew(), renew()])).map(value => value.status).sort()).toEqual([200, 409]);
    const offers = await Offer.find({applicationId: who.id}).sort({revision: 1}).lean(); expect(offers).toHaveLength(2); expect(offers[0]).toMatchObject({active: false, status: "replaced"});
    expect(offers[1]).toMatchObject({active: true, amountKobo: previous.amountKobo, termsText: previous.termsText, termsVersion: previous.termsVersion});
    expect(await Offer.countDocuments({applicationId: who.id, active: true})).toBe(1);
  });
  it("waitlists then rejects without fees and blocks unassessed, held and self decisions", async () => {
    const who = await assessed();
    await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.headers).send({version: who.version, decision: "accept", reason}).expect(403);
    const unassessed = await submitted();
    await request(app).post(`/api/v1/admin/applications/${unassessed.id}/decision`).set(who.admin.headers).send({version: unassessed.version, decision: "accept", reason}).expect(409);
    await applications.Application.updateOne({_id: who.id}, {$set: {consentHold: true}});
    await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version: who.version, decision: "accept", reason}).expect(409);
    await applications.Application.updateOne({_id: who.id}, {$set: {consentHold: false}});
    await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version: who.version, decision: "waitlist", reason}).expect(200);
    await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version: who.version + 1, decision: "reject", reason}).expect(200);
    expect(await Offer.countDocuments({applicationId: who.id})).toBe(0);
    await applications.Application.collection.updateOne({_id: new (await import("mongoose")).Types.ObjectId(unassessed.id)}, {$set: {ownerId: who.admin.userId, status: "assessed"}});
    await request(app).post(`/api/v1/admin/applications/${unassessed.id}/decision`).set(who.admin.headers).send({version: unassessed.version, decision: "accept", reason}).expect(403);
  });
  it("rejects client fee injection and rolls back acceptance if notification enqueue fails", async () => {
    const who = await assessed(); const body = {version: who.version, decision: "accept", reason};
    await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({...body, amountKobo: 1}).expect(400);
    const failing = createApp({identityService: identity, authConfig: config, storage, adminKey: key, mail: {...mail, enqueue: async () => {throw new Error("Synthetic decision mail failure");}}}); failing.use(safeErrorHandler);
    await request(failing).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send(body).expect(500);
    expect((await applications.Application.findById(who.id).lean())?.status).toBe("assessed"); expect(await Offer.countDocuments({applicationId: who.id})).toBe(0);
  });
});
it("enforces a visible rejection cooldown on both tracks and permits a new application after expiry",async()=>{const who=await assessed();const oldDraft=await request(app).post("/api/v1/applications").set(who.headers).send({track:"established"}).expect(201);await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version:who.version,decision:"reject",reason:"Please develop your portfolio before another assessment.",reapplyDays:30}).expect(200);const eligibility=await request(app).get("/api/v1/applications/eligibility").set(who.headers).expect(200);expect(eligibility.body.canApply).toBe(false);const denied=await request(app).post(`/api/v1/applications/${oldDraft.body.id}/submit`).set(who.headers).send({version:0,declarations:{accuracy:true,termsAccepted:true,privacyAccepted:true,termsVersion:applicationTermsVersion,privacyVersion:applicationPrivacyVersion}}).expect(422);expect(denied.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({path:"reapplication"})]));expect(Date.parse(eligibility.body.availableAt)).toBeGreaterThan(Date.now()+29*86400000);await request(app).post("/api/v1/applications").set(who.headers).send({track:"academy"}).expect(409);const resumed=await request(app).post("/api/v1/applications").set(who.headers).send({track:"established"}).expect(200);expect(resumed.body.id).toBe(oldDraft.body.id);expect(await Offer.countDocuments({applicationId:who.id})).toBe(0);const user=(await identity.models.User.findOne({emailNormalized:who.email}).lean())!;await identity.models.User.updateOne({_id:user._id},{$set:{applicationBlockedUntil:new Date(Date.now()-1)}});await request(app).post("/api/v1/applications").set(who.headers).send({track:"academy"}).expect(201);});
