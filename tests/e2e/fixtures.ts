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

export async function submittedApplicant(request: APIRequestContext) {
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
  const created = await request.post("/api/v1/applications", {headers, data: {track: "academy"}}); expect(created.status()).toBe(201); const id = (await created.json()).id as string;
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
