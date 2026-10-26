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
const database = createDatabase(uri); const connection = database.connection.useDb(`payments_${randomUUID().replaceAll("-", "")}_test`);
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

async function accepted() {
  const who = await assessed(); await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version: who.version, decision: "accept", reason}).expect(200);
  const offer = (await Offer.findOne({applicationId: who.id}).lean())!; return {...who, offer};
}
const Payment = createPaymentModel(connection);
describe("server-owned test checkout initialization", () => {
  it("persists one attempt before provider calls and reuses it under concurrency", async () => {
    const who = await accepted(); let calls = 0;
    const provider = {initialize: async (input: {amount: number; reference: string; offerId: string}) => {
      calls++; expect(input.amount).toBe(5_000_000); expect(input.offerId).toBe(String(who.offer._id));
      expect(await Payment.countDocuments({reference: input.reference})).toBe(1);
      await new Promise(resolve => setTimeout(resolve, 30)); return "https://checkout.paystack.com/synthetic-fixture";
    }};
    const checkout = createApp({identityService: identity, authConfig: config, mail, storage, adminKey: key, checkoutProvider: provider}); checkout.use(safeErrorHandler);
    const send = () => request(checkout).post(`/api/v1/payments/offers/${who.offer._id}/checkout`).set(who.headers).send({termsVersion: who.offer.termsVersion, acceptsTerms: true});
    const results = await Promise.all([send(), send(), send()]); expect(results.every(value => [200, 201].includes(value.status))).toBe(true);
    expect(calls).toBe(1); expect(new Set(results.map(value => value.body.reference)).size).toBe(1);
    const resume = await send(); expect(resume.body.checkoutUrl).toBe("https://checkout.paystack.com/synthetic-fixture"); expect(calls).toBe(1);
    const reference = resume.body.reference;
    const callback = await request(checkout).get(`/api/v1/payments/${reference}?status=success&amount=1`).set(who.headers).expect(200);
    expect(callback.body.state).toBe("initialized"); expect((await identity.models.User.findOne({emailNormalized: who.email}).lean())?.roles).toEqual(["applicant"]);
    await request(checkout).get(`/api/v1/payments/${reference}`).set((await fixture()).headers).expect(404);
    await request(checkout).post(`/api/v1/payments/${reference}`).set(who.headers).send({state: "successful"}).expect(404);
  });
  it("keeps uncertain initialization durable and never generates a second charge reference", async () => {
    const who = await accepted(); let calls = 0;
    const checkout = createApp({identityService: identity, authConfig: config, mail, storage, adminKey: key, checkoutProvider: {initialize: async () => {calls++; throw new Error("Synthetic provider timeout");}}}); checkout.use(safeErrorHandler);
    const send = () => request(checkout).post(`/api/v1/payments/offers/${who.offer._id}/checkout`).set(who.headers).send({termsVersion: who.offer.termsVersion, acceptsTerms: true});
    const first = await send(); expect(first.status).toBe(201); expect(first.body).toMatchObject({state: "initialization_unknown", checkoutUrl: null});
    const retry = await send(); expect(retry.status).toBe(200); expect(retry.body.reference).toBe(first.body.reference); expect(calls).toBe(1);
    await Offer.collection.updateOne({_id: who.offer._id}, {$set: {expiresAt: new Date(0)}});
    await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version: who.version + 1, decision: "renew", reason}).expect(409);
  });
  it("denies wrong owners, invalid terms, fee injection, expired offers and missing configuration", async () => {
    const who = await accepted(); const provider = {initialize: async () => "https://checkout.paystack.com/synthetic-fixture"};
    const checkout = createApp({identityService: identity, authConfig: config, mail, storage, adminKey: key, checkoutProvider: provider}); checkout.use(safeErrorHandler);
    const path = `/api/v1/payments/offers/${who.offer._id}/checkout`; const data = {termsVersion: who.offer.termsVersion, acceptsTerms: true};
    await request(checkout).post(path).set((await fixture()).headers).send(data).expect(409);
    await request(checkout).post(path).set(who.headers).send({...data, amountKobo: 1}).expect(400);
    await request(checkout).post(path).set(who.headers).send({...data, termsVersion: "old-terms"}).expect(409);
    await request(app).post(path).set(who.headers).send(data).expect(503);
    await applications.Application.updateOne({_id: who.id}, {$set: {status: "waitlisted"}});
    await request(checkout).post(path).set(who.headers).send(data).expect(409);
    await applications.Application.updateOne({_id: who.id}, {$set: {status: "accepted"}});
    await Offer.collection.updateOne({_id: who.offer._id}, {$set: {expiresAt: new Date(0)}});
    await request(checkout).post(path).set(who.headers).send(data).expect(409);
    expect(await Payment.countDocuments({offerId: who.offer._id})).toBe(0);
  });
});
