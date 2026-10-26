import { createMembershipService } from "../../apps/api/src/members/service.js";
import { createMemberModels } from "../../apps/api/src/members/models.js";
import { createSettlementService } from "../../apps/api/src/payments/settlement.js";
import { hashPassword, verifyPassword } from "../../apps/api/src/identity/password.js";
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
const database = createDatabase(uri); const connection = database.connection.useDb(`membership_${randomUUID().replaceAll("-", "")}_test`);
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

const {Entitlement, Invitation, Member} = createMemberModels(connection); const service = createMembershipService(identity, mail, origin);
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
describe("paid invitation issuance and distinct member activation", () => {
  it.each(["academy", "established"] as const)("issues and consumes %s access once without changing the applicant password", async track => {
    const who = await paid(track); const ids = await Promise.all([service.ensure(who.payment._id), service.ensure(who.payment._id)]);
    expect(ids[0]).toBeTruthy(); expect(ids[0]).toBe(ids[1]); expect(await Entitlement.countDocuments({applicationId: who.id})).toBe(1); const id = ids[0]!;
    const secret = await token(id); expect(secret.invitation.expiresAt.getTime() - secret.invitation.createdAt.getTime()).toBeGreaterThan(6 * 24 * 60 * 60_000);
    expect(await Invitation.findById(secret.invitation._id).lean()).not.toHaveProperty("tokenHash");
    expect((await Invitation.findById(secret.invitation._id).select("+tokenHash").lean())?.tokenHash).not.toBe(secret.raw);
    expect(secret.job.encryptedPayload).not.toContain(secret.raw);
    const state = await request(app).get("/api/v1/membership-invitations").set(who.headers).expect(200); expect(state.text).not.toContain(secret.raw); expect(state.text).not.toContain("tokenHash");
    const replies = await Promise.all([1,2].map(() => request(app).post("/api/v1/member/activate").set(common).send({...input(who.email, secret.raw), username: `member_${randomBytes(6).toString("hex")}`})));
    expect(replies.map(reply => reply.status).sort()).toEqual([200, 400]); const success = replies.find(reply => reply.status === 200)!;
    const expected = track === "academy" ? "student" : "model"; expect(success.body.type).toBe(expected); expect(await Member.countDocuments({entitlementId: id})).toBe(1);
    const stored = (await identity.models.User.findOne({emailNormalized: who.email}).select("+passwordHash").lean())!; expect(await verifyPassword(stored.passwordHash, password)).toBe(true); expect(stored.roles).toContain(expected); expect(stored.roles).not.toContain(track === "academy" ? "model" : "student");
    expect(await identity.authenticate(who.headers.Cookie.split("=")[1]!)).toBeNull();
    const cookies = (success.headers["set-cookie"] as unknown as string[]).map(value => value.split(";")[0]).join("; ");
    await request(app).get(`/api/v1/member/${expected}`).set("Cookie", cookies).expect(200); await request(app).get(`/api/v1/member/${track === "academy" ? "model" : "student"}`).set("Cookie", cookies).expect(403);
    await request(app).post("/api/v1/member/activate").set(common).send(input(who.email, secret.raw)).expect(400);
    expect((await model.findById(secret.job._id).select("+encryptedPayload").lean())?.encryptedPayload).toBeUndefined();
  });
  it("denies wrong email/password, cross-purpose use, fee or role injection and unverified identities", async () => {
    const who = await paid(); const id = (await service.ensure(who.payment._id))!; const secret = await token(id);
    const wrong = await fixture(); await identity.models.User.updateOne({emailNormalized: wrong.email}, {$set: {passwordHash: encoded}});
    expect(await service.activate(input(wrong.email, secret.raw))).toBeNull(); expect(await service.activate({...input(who.email, secret.raw), password: "incorrect-password"})).toBeNull();
    await request(app).post("/api/v1/member/activate").set(common).send({...input(who.email, secret.raw), role: "admin", newPassword: "an attacker chosen passphrase"}).expect(400);
    await request(app).post("/api/v1/auth/verify-email").set(common).send({token: secret.raw}).expect(400);
    await identity.models.User.updateOne({emailNormalized: who.email}, {$unset: {emailVerifiedAt: 1}}); expect(await service.activate(input(who.email, secret.raw))).toBeNull();
    expect(await Member.countDocuments({entitlementId: id})).toBe(0);
  });
  it("revokes/reissues keys without charging again and prevents revoked or expired key redemption", async () => {
    const who = await paid(); const id = (await service.ensure(who.payment._id))!; const old = await token(id);
    await Entitlement.updateOne({_id: id}, {$set: {lastIssuedAt: new Date(0)}});
    const actor = (await identity.authenticate(who.headers.Cookie.split("=")[1]!))!; expect(await service.issue(id, actor)).toBe(true); const replacement = await token(id); expect(replacement.raw).not.toBe(old.raw);
    expect(await service.activate(input(who.email, old.raw))).toBeNull(); expect((await model.findById(old.job._id).select("+encryptedPayload").lean())?.encryptedPayload).toBeUndefined();
    await Invitation.collection.updateOne({_id: replacement.invitation._id}, {$set: {expiresAt: new Date(0)}}); expect(await service.activate(input(who.email, replacement.raw))).toBeNull();
    const admin = (await identity.authenticate(who.admin.headers.Cookie.split("=")[1]!))!; const admins = createAdminService(identity, mail, key, origin); const authorize = (actor: typeof admin, session: import("mongoose").ClientSession) => admins.authorize(actor, session, false);
    expect(await service.revoke(id, admin, authorize)).toBe(true); await Entitlement.updateOne({_id: id}, {$set: {lastIssuedAt: new Date(0)}}); expect(await service.issue(id, actor)).toBe(false); expect(await service.issue(id, admin, authorize)).toBe(true);
    expect(await Payment.countDocuments({applicationId: who.id})).toBe(1); expect(await Entitlement.countDocuments({applicationId: who.id})).toBe(1);
  });
  it("backfills old verified payments, preserves entitlement through an email outage and scrubs expired payloads", async () => {
    const who = await paid(); await Payment.collection.updateOne({_id: who.payment._id}, {$unset: {membershipNextAttemptAt: 1}});
    const failing = createMembershipService(identity, {...mail, enqueue: async () => {throw new Error("Synthetic invitation enqueue outage");}}, origin);
    await Payment.updateMany({_id: {$ne: who.payment._id}}, {$set: {membershipProvisionedAt: new Date()}});
    expect(await failing.backfillOnce()).toBe(true); expect(await Entitlement.countDocuments({paymentId: who.payment._id})).toBe(1); expect(await Invitation.countDocuments({entitlementId: (await Entitlement.findOne({paymentId: who.payment._id}).lean())!._id})).toBe(0);
    await Payment.updateOne({_id: who.payment._id}, {$set: {membershipNextAttemptAt: new Date(0)}}); expect(await service.backfillOnce()).toBe(true);
    const entitlement = (await Entitlement.findOne({paymentId: who.payment._id}).lean())!; const secret = await token(String(entitlement._id));
    await model.updateOne({_id: secret.job._id}, {$set: {payloadExpiresAt: new Date(0)}}); await outbox.runOnce(async () => {});
    expect((await model.findById(secret.job._id).select("+encryptedPayload").lean())?.encryptedPayload).toBeUndefined(); expect((await model.findById(secret.job._id).lean())?.lastErrorCode).toBe("PAYLOAD_EXPIRED");
  });
  it("blocks refunded, held or anomalous payments and removes access when payment eligibility changes", async () => {
    const who = await paid();
    await Offer.collection.updateOne({_id: who.offer._id}, {$set: {track: "established"}}); expect(await service.ensure(who.payment._id)).toBeNull();
    await Offer.collection.updateOne({_id: who.offer._id}, {$set: {track: "academy"}});
    await Payment.updateOne({_id: who.payment._id}, {$set: {reviewReason: "late_settlement"}}); expect(await service.ensure(who.payment._id)).toBeNull();
    await Payment.updateOne({_id: who.payment._id}, {$set: {reviewReason: "", refundedKobo: 1}}); expect(await service.ensure(who.payment._id)).toBeNull();
    await Payment.updateOne({_id: who.payment._id}, {$set: {refundedKobo: 0}});
    await applications.Application.updateOne({_id: who.id}, {$set: {consentHold: true}}); expect(await service.ensure(who.payment._id)).toBeNull();
    await applications.Application.updateOne({_id: who.id}, {$set: {consentHold: false}}); const id = (await service.ensure(who.payment._id))!; const secret = await token(id);
    const result = (await service.activate(input(who.email, secret.raw)))!; const actor = (await identity.authenticate(result.session.token))!; expect((await service.access(actor)).memberships[0]?.accessible).toBe(true);
    await Payment.updateOne({_id: who.payment._id}, {$set: {refundedKobo: 1}}); expect((await service.access(actor)).memberships[0]?.accessible).toBe(false);
  });
  it("preserves MFA requirements when staff activate a separate member role", async () => {
    const who = await paid(); await identity.models.User.updateOne({emailNormalized: who.email}, {$addToSet: {roles: "admin"}, $set: {staffStatus: "active"}});
    const id = (await service.ensure(who.payment._id))!; const secret = await token(id);
    const response = await request(app).post("/api/v1/member/activate").set(common).send(input(who.email, secret.raw)).expect(200); expect(response.body.mfaRequired).toBe(true);
    const cookies = (response.headers["set-cookie"] as unknown as string[]).map(value => value.split(";")[0]).join("; ");
    const denied = await request(app).get("/api/v1/member/student").set("Cookie", cookies).expect(403); expect(denied.body.error.code).toBe("MFA_REQUIRED");
  });
  it("rolls back a username collision without consuming the valid invitation", async () => {
    const who = await paid(); const id = (await service.ensure(who.payment._id))!; const secret = await token(id);
    await identity.models.User.create({emailNormalized: `${randomUUID()}@example.test`, passwordHash: encoded, usernameNormalized: "taken_member", emailVerifiedAt: new Date(), roles: ["applicant"]});
    await request(app).post("/api/v1/member/activate").set(common).send({...input(who.email, secret.raw), username: "taken_member"}).expect(409);
    expect((await Invitation.findById(secret.invitation._id).lean())?.status).toBe("pending"); expect(await Member.countDocuments({entitlementId: id})).toBe(0);
    await request(app).post("/api/v1/member/activate").set(common).send(input(who.email, secret.raw)).expect(200);
  });

});
