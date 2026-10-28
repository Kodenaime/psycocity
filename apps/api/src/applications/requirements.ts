import { createIdentityModels } from "../identity/models.js";
import type { ClientSession, Connection } from "mongoose";
import { applicationPrivacyVersion, applicationTermsVersion, finalApplicationSchema } from "@psycocity/validation";
import { guardianStatus, subjectDetails, type ConsentSubject } from "../guardian/service.js";
import { createGuardianModel } from "../guardian/models.js";
import { createMediaModel } from "../media/models.js";
export async function assessApplication(application: ConsentSubject & { status: string; ownerId?:unknown }, connection: Connection, session?: ClientSession) {
  const parsed = finalApplicationSchema.safeParse({ track: application.track, answers: application.answers });
  const issues = parsed.success ? [] : parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message }));
  if (!["draft", "corrections_requested"].includes(application.status)) issues.push({ path: "status", message: "This application is not an editable draft" });
  if(application.ownerId){const user=await createIdentityModels(connection).User.findById(application.ownerId).select("applicationBlockedUntil").session(session??null).lean();if(user?.applicationBlockedUntil&&user.applicationBlockedUntil>new Date())issues.push({path:"reapplication",message:`You may apply again from ${user.applicationBlockedUntil.toLocaleString("en-NG",{timeZone:"Africa/Lagos"})} WAT.`});}
  const consent = await guardianStatus(application, connection, session);
  if (!consent.canUpload) issues.push({ path: "guardian", message: "Complete eligible personal details and any required guardian consent; resolve any consent hold" });
  const guardianRecord = consent.required && consent.canUpload ? await createGuardianModel(connection).findOne({ applicationId: application._id, status: "consented", subjectHash: subjectDetails(application).hash }).sort({ createdAt: -1, _id: -1 }).select("_id").session(session ?? null).lean() : null;
  if (consent.required && consent.canUpload && !guardianRecord) issues.push({ path: "guardian", message: "Refresh the guardian consent record before submitting" });
  const Media = createMediaModel(connection);
  const media = await Media.find({ applicationId: application._id, active: true, status: "ready" }).session(session ?? null).lean();
  for (const slot of ["headshot", "profile", "full_body_front", "full_body_side"]) if (!media.some(value => value.slot === slot)) issues.push({ path: `photos.${slot}`, message: `Upload the ${slot.replaceAll("_", " ")} photograph` });
  if (await Media.exists({ applicationId: application._id, status: "processing", expiresAt: { $gt: new Date() } }).session(session ?? null)) issues.push({ path: "photos", message: "Wait for current uploads to finish before submitting" });
  return { canSubmit: issues.length === 0, issues, guardianConsentId: guardianRecord ? String(guardianRecord._id) : null, canonicalAnswers: parsed.success ? parsed.data.answers : undefined, mediaIds: media.map(value => value._id), termsVersion: applicationTermsVersion, privacyVersion: applicationPrivacyVersion };
}
