import type { ClientSession, Connection, Types } from "mongoose";
import { ageOn, birthDateSchema, draftAnswersSchema, guardianPolicyVersion, guardianStatusSchema } from "@psycocity/validation";
import { hashToken } from "../identity/service.js";
import { createGuardianModel } from "./models.js";
export type ConsentSubject = { _id: Types.ObjectId | string; track: string; answers: unknown; consentHold?: boolean };
export function subjectDetails(application: ConsentSubject) {
  const answers = draftAnswersSchema.parse(application.answers ?? {});
  const name = answers.personal?.legalName?.trim() ?? "";
  const birthDate = answers.personal?.birthDate;
  const age = birthDate && birthDateSchema.safeParse(birthDate).success ? ageOn(birthDate) : undefined;
  const required = application.track === "academy" && age !== undefined && age >= 16 && age < 18;
  return { name, age, required, hash: hashToken(JSON.stringify([String(application._id), name.toLowerCase(), birthDate, guardianPolicyVersion])) };
}
export async function guardianStatus(application: ConsentSubject, connection: Connection, session?: ClientSession) {
  const subject = subjectDetails(application);
  if (subject.age === undefined || subject.name.length < 2) return guardianStatusSchema.parse({ required: false, canUpload: false, status: "incomplete" });
  if (subject.age < (application.track === "academy" ? 16 : 18)) return guardianStatusSchema.parse({ required: false, canUpload: false, status: "ineligible" });
  if (!subject.required) return guardianStatusSchema.parse({ required: false, canUpload: !application.consentHold, status: application.consentHold ? "withdrawn" : "not_required" });
  let query = createGuardianModel(connection).findOne({ applicationId: application._id }).sort({ createdAt: -1, _id: -1 });
  if (session) query = query.session(session);
  const record = await query.lean();
  if (!record) return guardianStatusSchema.parse({ required: true, canUpload: false, status: "missing" });
  const status = record.subjectHash !== subject.hash || record.policyVersion !== guardianPolicyVersion ? "changed" : record.status === "pending" && record.expiresAt <= new Date() ? "expired" : record.status === "superseded" ? "changed" : record.status;
  return guardianStatusSchema.parse({ required: true, canUpload: status === "consented" && !application.consentHold, status, guardianName: record.guardianName, guardianEmail: record.guardianEmail, relationship: record.relationship });
}
