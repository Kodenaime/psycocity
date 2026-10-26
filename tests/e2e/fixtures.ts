import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { expect, type APIRequestContext } from "@playwright/test";
import { applicationPrivacyVersion, applicationTermsVersion } from "@psycocity/validation";
import { createDatabase } from "../../apps/api/src/database.js";
import { createIdentityModels } from "../../apps/api/src/identity/models.js";
import { createIdentityService } from "../../apps/api/src/identity/service.js";
import { hashPassword } from "../../apps/api/src/identity/password.js";
const answers = {
  personal: { legalName: "Sample Applicant", birthDate: "2000-01-01", phone: "08012345678" },
  location: { country: "Nigeria", state: "Lagos", city: "Ikeja" },
  measurements: { heightCm: 175, waistCm: 70, shoeSize: 40, shoeSystem: "EU" },
  background: { introduction: "I am ready to develop my modelling craft and professional confidence.", interests: "Editorial and runway", availability: "Weekends", experience: "I have worked on local fashion campaigns." },
  academy: { learningGoals: "Develop my runway and portfolio skills", hybridAvailability: "Weekends in person and online" },
  established: { representationHistory: "Independent", contractualRestrictions: "None" },
};

export async function submittedApplicant(request: APIRequestContext, track: "academy" | "established" = "academy") {
  const uri = process.env.TEST_MONGODB_URI;
  if (!uri || !/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated E2E database required");
  const database = createDatabase(uri); const email = `review-${randomUUID()}@example.test`; const password = "review applicant browser passphrase";
  let session;
  try {
    await database.connect(); const identity = createIdentityService(createIdentityModels(database.connection));
    const user = await identity.models.User.create({emailNormalized: email, passwordHash: await hashPassword(password), roles: ["applicant"], emailVerifiedAt: new Date()});
    session = await identity.issueSession(String(user._id));
  } finally { await database.close(); }
  const headers = {Origin: "http://127.0.0.1:3101", "X-Requested-With": "Psycocity", Cookie: `psycocity_session=${session.token}`, "X-CSRF-Token": session.csrfToken};
  const created = await request.post("/api/v1/applications", {headers, data: {track}}); expect(created.status()).toBe(201); const id = (await created.json()).id as string;
  const data = structuredClone(answers); data.personal.legalName = `Review ${randomUUID().slice(0,8)}`;
  expect((await request.patch(`/api/v1/applications/${id}`, {headers, data: {version: 0, answers: data}})).status()).toBe(200);
  const picture = await sharp({create: {width: 320, height: 480, channels: 3, background: "#e7db9d"}}).png().toBuffer();
  for (const slot of ["headshot", "profile", "full_body_front", "full_body_side"]) {
    const result = await request.post("/api/v1/media/uploads", {headers, data: {applicationId: id, slot}}); expect(result.status()).toBe(201); const grant = await result.json();
    expect((await request.put(grant.uploadUrl, {headers: {...headers, "X-Upload-Token": grant.uploadToken, "Content-Type": "image/png"}, data: picture})).status()).toBe(200);
  }
  expect((await request.post(`/api/v1/applications/${id}/submit`, {headers, data: {version: 1, declarations: {accuracy: true, termsAccepted: true, privacyAccepted: true, termsVersion: applicationTermsVersion, privacyVersion: applicationPrivacyVersion}}})).status()).toBe(200);
  return {id, email, password, name: data.personal.legalName};
}

export async function settledPayment(request: APIRequestContext, track: "academy" | "established" = "academy") {
  const applicant = await submittedApplicant(request, track); const uri = process.env.TEST_MONGODB_URI;
  if (!uri || !/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated E2E database required");
  const [{createApplicationModels}, {createOfferModel}, {createPaymentModel}, {createSettlementService}, {createMailRuntime}, {admissionTermsText, admissionTermsVersion}] = await Promise.all([import("../../apps/api/src/applications/models.js"), import("../../apps/api/src/offers/models.js"), import("../../apps/api/src/payments/models.js"), import("../../apps/api/src/payments/settlement.js"), import("../../apps/api/src/mail/runtime.js"), import("@psycocity/validation")]);
  const database = createDatabase(uri); let reference = "";
  try {
    await database.connect(); const connection = database.connection; const identity = createIdentityService(createIdentityModels(connection));
    const user = (await identity.models.User.findOne({emailNormalized: applicant.email}).lean())!;
    await createApplicationModels(connection).Application.updateOne({_id: applicant.id}, {$set: {status: "accepted"}});
    const offer = await createOfferModel(connection).create({applicationId: applicant.id, ownerId: user._id, track, amountKobo: track === "academy" ? 5_000_000 : 3_000_000, currency: "NGN", termsVersion: admissionTermsVersion, termsText: admissionTermsText, expiresAt: new Date(Date.now() + 24 * 60 * 60_000), issuedBy: user._id, revision: 1, applicationVersion: 3});
    reference = `psyc_${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "").slice(0,8)}`;
    await createPaymentModel(connection).create({offerId: offer._id, applicationId: applicant.id, ownerId: user._id, reference, amountKobo: offer.amountKobo, currency: "NGN", termsVersion: offer.termsVersion, termsAcceptedAt: new Date(), state: "initialized", initializationExpiresAt: new Date()});
    const mail = await createMailRuntime(connection, {...process.env, EMAIL_TRANSPORT: "local"}, "test");
    const service = createSettlementService(identity, {validSignature: () => false, verify: async () => ({id: `${Date.now()}${Math.floor(Math.random() * 10_000)}`, reference, status: "success", amount: offer.amountKobo, currency: "NGN", domain: "test", paid_at: new Date().toISOString(), customer: {email: applicant.email}, metadata: {applicationId: applicant.id, offerId: String(offer._id)}})}, mail, "http://127.0.0.1:3101");
    expect(await service.runOnce(reference)).toBe(true);
  } finally {await database.close();}
  return {...applicant, reference};
}

export async function invitedMember(request: APIRequestContext, track: "academy" | "established" = "academy") {
  const payer = await settledPayment(request, track); const uri = process.env.TEST_MONGODB_URI;
  if (!uri || !/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated E2E database required");
  const [{createMembershipService}, {createPaymentModel}, {createMailRuntime}] = await Promise.all([import("../../apps/api/src/members/service.js"), import("../../apps/api/src/payments/models.js"), import("../../apps/api/src/mail/runtime.js")]);
  const database = createDatabase(uri);
  try {
    await database.connect(); const identity = createIdentityService(createIdentityModels(database.connection)); const payment = (await createPaymentModel(database.connection).findOne({reference: payer.reference}).lean())!;
    const mail = await createMailRuntime(database.connection, {...process.env, EMAIL_TRANSPORT: "local"}, "test");
    expect(await createMembershipService(identity, mail, "http://127.0.0.1:3101").ensure(payment._id)).toBeTruthy();
  } finally {await database.close();}
  return payer;
}
