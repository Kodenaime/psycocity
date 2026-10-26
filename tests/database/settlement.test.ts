import { createHmac } from "node:crypto";
import { createSettlementService } from "../../apps/api/src/payments/settlement.js";
import { createRefundService } from "../../apps/api/src/payments/refunds.js";
import { createFinancialModels, createRefundModel } from "../../apps/api/src/payments/models.js";
import { webhookVerifier, type VerifiedTransaction, type VerificationProvider } from "../../apps/api/src/payments/verification-provider.js";
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
import { createOutboxModel } from "../../apps/api/src/mail/models.js";
import { createOutbox } from "../../apps/api/src/mail/outbox.js";
import { localMailSender, type Mail } from "../../apps/api/src/mail/delivery.js";
import { localPrivateStorage, type PrivateStorage } from "../../apps/api/src/media/storage.js";
import { createApp } from "../../apps/api/src/app.js";
import { safeErrorHandler } from "../../apps/api/src/errors.js";
import type { Express } from "express";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated _test database required");
const database = createDatabase(uri); const connection = database.connection.useDb(`settlement_${randomUUID().replaceAll("-", "")}_test`);
const identity = createIdentityService(createIdentityModels(connection));
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

async function accepted() {
  const who = await assessed(); await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version: who.version, decision: "accept", reason}).expect(200);
  const offer = (await Offer.findOne({applicationId: who.id}).lean())!; return {...who, offer};
}
const Payment = createPaymentModel(connection);

const {Event, Receipt} = createFinancialModels(connection); const Refund = createRefundModel(connection); const signingKey = "synthetic-webhook-fixture";
async function initialized() {
  const who = await accepted();
  const checkout = createApp({identityService: identity, authConfig: config, mail, storage, adminKey: key, checkoutProvider: {initialize: async () => "https://checkout.paystack.com/synthetic"}}); checkout.use(safeErrorHandler);
  const result = await request(checkout).post(`/api/v1/payments/offers/${who.offer._id}/checkout`).set(who.headers).send({termsVersion: who.offer.termsVersion, acceptsTerms: true}).expect(201);
  const payment = (await Payment.findOne({reference: result.body.reference}).lean())!;
  const verified: VerifiedTransaction = {id: String(Math.floor(Math.random() * 1_000_000_000) + 1), reference: payment.reference, status: "success", amount: payment.amountKobo, currency: "NGN", domain: "test", paid_at: new Date().toISOString(), customer: {email: who.email}, metadata: {applicationId: who.id, offerId: String(who.offer._id)}};
  const provider: VerificationProvider = {verify: async () => verified, validSignature: webhookVerifier(signingKey)};
  const server = createApp({identityService: identity, authConfig: config, mail, storage, adminKey: key, verificationProvider: provider}); server.use(safeErrorHandler);
  const service = createSettlementService(identity, provider, mail, origin);
  return {...who, payment, verified, provider, server, service};
}
function webhook(who: Awaited<ReturnType<typeof initialized>>, id = who.verified.id) {
  const raw = JSON.stringify({event: "charge.success", data: {reference: who.payment.reference, id, authorization: {sensitive: "must-not-be-stored"}}});
  return request(who.server).post("/api/v1/paystack/webhook").set("Content-Type", "application/json").set("x-paystack-signature", createHmac("sha512", signingKey).update(raw).digest("hex")).send(raw);
}
async function due(reference: string) {await Payment.updateOne({reference}, {$set: {nextVerifyAt: new Date(0)}});}
describe("verified settlement and durable reconciliation", () => {
  it("rejects invalid signatures and settles concurrent signed deliveries exactly once without granting roles", async () => {
    const who = await initialized();
    await request(who.server).post("/api/v1/paystack/webhook").set("Content-Type", "application/json").set("x-paystack-signature", "a".repeat(128)).send({event: "charge.success", data: {reference: who.payment.reference, id: who.verified.id}}).expect(401);
    expect(await Event.countDocuments({reference: who.payment.reference})).toBe(0);
    const delivered = await Promise.all([webhook(who), webhook(who), webhook(who)]); expect(delivered.every(value => value.status === 200)).toBe(true);
    expect(await Event.countDocuments({reference: who.payment.reference})).toBe(1);
    expect(JSON.stringify(await Event.find({reference: who.payment.reference}).lean())).not.toContain("must-not-be-stored");
    const runs = await Promise.all([who.service.runOnce(who.payment.reference), who.service.runOnce(who.payment.reference)]); expect(runs.filter(Boolean)).toHaveLength(1);
    const payment = (await Payment.findById(who.payment._id).lean())!; expect(payment).toMatchObject({state: "successful", providerId: who.verified.id, reviewReason: ""});
    expect(await Receipt.countDocuments({paymentId: payment._id})).toBe(1); expect(await model.countDocuments({dedupeKey: `payment-receipt:${payment._id}`})).toBe(1);
    expect((await identity.models.User.findOne({emailNormalized: who.email}).lean())?.roles).toEqual(["applicant"]);
    await webhook(who).expect(200); await who.service.runOnce(who.payment.reference); expect(await Receipt.countDocuments({paymentId: payment._id})).toBe(1);
    const own = await request(who.server).get(`/api/v1/payments/${payment.reference}/detail`).set(who.headers).expect(200); expect(own.body.receipt.number).toMatch(/^PSYC-/);
    await request(who.server).get(`/api/v1/payments/${payment.reference}/detail`).set((await fixture()).headers).expect(404);
  });
  it.each(["amount", "currency", "reference", "email", "applicationId", "offerId"])("rejects a provider %s mismatch", async field => {
    const who = await initialized(); const result = structuredClone(who.verified);
    if (field === "amount") result.amount = 1; else if (field === "currency") result.currency = "USD"; else if (field === "reference") result.reference = "different"; else if (field === "email") result.customer.email = "different@example.test"; else if (field === "applicationId") result.metadata.applicationId = "different"; else result.metadata.offerId = "different";
    const service = createSettlementService(identity, {...who.provider, verify: async () => result}, mail, origin); await service.runOnce(who.payment.reference);
    expect((await Payment.findById(who.payment._id).lean())?.reviewReason).toBe("verification_mismatch"); expect((await Payment.findById(who.payment._id).lean())?.state).not.toBe("successful"); expect(await Receipt.countDocuments({paymentId: who.payment._id})).toBe(0);
  });
  it("recovers a provider outage and a receipt enqueue outage without losing the verified charge", async () => {
    const who = await initialized(); let calls = 0;
    const unavailable = createSettlementService(identity, {...who.provider, verify: async () => {calls++; throw new Error("Synthetic provider outage");}}, mail, origin);
    await unavailable.runOnce(who.payment.reference); expect(calls).toBe(1); expect((await Payment.findById(who.payment._id).lean())?.state).not.toBe("successful");
    await due(who.payment.reference);
    const noEmail = createSettlementService(identity, who.provider, {...mail, enqueue: async () => {throw new Error("Synthetic receipt enqueue outage");}}, origin);
    await noEmail.runOnce(who.payment.reference); expect((await Payment.findById(who.payment._id).lean())?.state).toBe("successful"); expect(await Receipt.countDocuments({paymentId: who.payment._id})).toBe(0);
    await due(who.payment.reference); await who.service.runOnce(who.payment.reference); expect(await Receipt.countDocuments({paymentId: who.payment._id})).toBe(1);
  });
  it("detects late settlement and duplicate-charge hints, and protects receipts from delivery failures", async () => {
    const who = await initialized(); await Offer.collection.updateOne({_id: who.offer._id}, {$set: {expiresAt: new Date(0)}});
    await who.service.runOnce(who.payment.reference); expect((await Payment.findById(who.payment._id).lean())?.reviewReason).toBe("late_settlement");
    await webhook(who, "999999999999").expect(200); expect((await Payment.findById(who.payment._id).lean())?.reviewReason).toBe("duplicate_charge");
    const receiptJob = await model.findOne({dedupeKey: `payment-receipt:${who.payment._id}`}).lean(); expect(receiptJob).not.toBeNull();
    await model.updateMany({_id: {$ne: receiptJob!._id}}, {$set: {nextAttemptAt: new Date(Date.now() + 60_000)}});
    await outbox.runOnce(async () => {throw new Error("Synthetic delivery outage");});
    expect((await model.findById(receiptJob!._id).lean())?.lastErrorCode).toBe("DELIVERY_FAILED");
    await model.updateOne({_id: receiptJob!._id}, {$set: {nextAttemptAt: new Date(0)}});
    await outbox.runOnce(async message => {expect(message.to).toBe(who.email); expect(message.subject).toContain("receipt");});
    expect((await model.findById(receiptJob!._id).lean())?.state).toBe("delivered"); expect(await Receipt.countDocuments({paymentId: who.payment._id})).toBe(1);
    const queue = await request(who.server).get("/api/v1/admin/payments?review=anomalies").set(who.admin.headers).expect(200); expect(queue.body.items.some((item: {reference: string}) => item.reference === who.payment.reference)).toBe(true);
    await request(who.server).post(`/api/v1/admin/payments/${who.payment.reference}/reconcile`).set(who.headers).send({state: "successful"}).expect(403);
  });
  it("verifies refunds, rechecks pending provider status and preserves totals through email outages", async () => {
    const who = await initialized(); await who.service.runOnce(who.payment.reference);
    const actor = (await identity.authenticate(who.admin.headers.Cookie.split("=")[1]!))!;
    const adminService = createAdminService(identity, mail, key, origin); const authorize = (reviewer: typeof actor, session: import("mongoose").ClientSession) => adminService.authorize(reviewer, session, false);
    let status: "pending" | "processed" = "pending";
    const provider = {...who.provider, verifyRefund: async (id: string) => ({id, transaction: who.verified.id, amount: 1_000_000, currency: "NGN" as const, status})};
    const service = createRefundService(identity, provider, {...mail, enqueue: async () => {throw new Error("Synthetic refund email outage");}}, origin);
    await service.record(who.payment.reference, "123456", actor, "Provider refund requested through the provider dashboard.", authorize);
    expect((await Payment.findById(who.payment._id).lean())?.refundedKobo).toBe(0);
    status = "processed"; await Refund.updateOne({providerRefundId: "123456"}, {$set: {nextCheckAt: new Date(0)}}); await service.runOnce();
    expect((await Payment.findById(who.payment._id).lean())?.refundedKobo).toBe(1_000_000);
    const recovered = createRefundService(identity, provider, mail, origin); await Refund.updateOne({providerRefundId: "123456"}, {$set: {nextCheckAt: new Date(0)}}); await recovered.runOnce();
    expect(await model.countDocuments({dedupeKey: "refund-processed:123456"})).toBe(1);
    await recovered.record(who.payment.reference, "123456", actor, "Recheck the same refund reference.", authorize);
    const ownerRecord = await request(who.server).get(`/api/v1/payments/${who.payment.reference}/detail`).set(who.headers).expect(200);
    const staffRecord = await request(who.server).get(`/api/v1/admin/payments/${who.payment.reference}`).set(who.admin.headers).expect(200);
    expect(ownerRecord.text).not.toContain("Provider refund requested through the provider dashboard.");
    expect(staffRecord.body.refunds[0].internalNote).toBe("Provider refund requested through the provider dashboard.");
    expect((await Payment.findById(who.payment._id).lean())?.refundedKobo).toBe(1_000_000);
    await expect(createRefundService(identity, {...provider, verifyRefund: async id => ({id, transaction: "different", amount: 1, currency: "NGN", status: "processed"})}, mail, origin).record(who.payment.reference, "987654", actor, "Wrong provider transaction must be denied.", authorize)).rejects.toThrow();
  });
  it("recovers an expired worker lease without a webhook or open browser", async () => {
    const who = await initialized();
    await Payment.updateMany({_id: {$ne: who.payment._id}}, {$set: {nextVerifyAt: new Date(Date.now() + 60 * 60_000)}});
    await Payment.updateOne({_id: who.payment._id}, {$set: {verificationLeaseUntil: new Date(Date.now() + 60_000), verificationLeaseToken: "lost-worker-fixture"}});
    expect(await who.service.runOnce(who.payment.reference)).toBe(false);
    await Payment.updateOne({_id: who.payment._id}, {$set: {verificationLeaseUntil: new Date(0)}});
    expect(await who.service.runOnce()).toBe(true);
    expect((await Payment.findById(who.payment._id).lean())?.state).toBe("successful");
    expect(await Receipt.countDocuments({paymentId: who.payment._id})).toBe(1);
  });
  it("keeps a pending provider result unpaid until later verification succeeds", async () => {
    const who = await initialized(); const service = createSettlementService(identity, {...who.provider, verify: async () => ({...who.verified, status: "pending", paid_at: null})}, mail, origin);
    await service.runOnce(who.payment.reference); expect((await Payment.findById(who.payment._id).lean())?.state).not.toBe("successful"); expect(await Receipt.countDocuments({paymentId: who.payment._id})).toBe(0);
    await due(who.payment.reference); await who.service.runOnce(who.payment.reference); expect((await Payment.findById(who.payment._id).lean())?.state).toBe("successful");
  });
  it("serializes concurrent refund totals and denies refunds beyond the verified charge", async () => {
    const who = await initialized(); await who.service.runOnce(who.payment.reference);
    const actor = (await identity.authenticate(who.admin.headers.Cookie.split("=")[1]!))!; const adminService = createAdminService(identity, mail, key, origin);
    const service = createRefundService(identity, {...who.provider, verifyRefund: async id => ({id, transaction: who.verified.id, amount: 3_000_000, currency: "NGN", status: "processed"})}, mail, origin);
    const run = (id: string) => service.record(who.payment.reference, id, actor, "Verify the provider refund against this payment.", (actor, session) => adminService.authorize(actor, session, false));
    const results = await Promise.allSettled([run("700001"), run("700002")]); expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await Payment.findById(who.payment._id).lean())?.refundedKobo).toBe(3_000_000);
  });

});
