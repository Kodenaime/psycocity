import { Schema, type Connection } from "mongoose";
import { applicationStates, correctionPaths } from "@psycocity/validation";
const profileSchema = new Schema({ userId: { type: Schema.Types.ObjectId, required: true, immutable: true } }, { timestamps: true, strict: "throw" });
profileSchema.index({ userId: 1 }, { unique: true });
const applicationSchema = new Schema({
  applicantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  ownerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  track: { type: String, enum: ["academy", "established"], required: true },
  status: { type: String, enum: applicationStates, required: true, default: "draft" },
  active: { type: Boolean, required: true, default: true },
  version: { type: Number, required: true, default: 0 },
  correctionFields: { type: [String], enum: correctionPaths, default: [] }, correctionMessage: String, reviewRevision: { type: Number, default: 0 },
  reapplyAfter:Date,
  submittedAt: Date, withdrawnAt: Date, submittedSnapshot: Schema.Types.Mixed,
  consentHold: { type: Boolean, required: true, default: false },
  eligibilityRevision: { type: Number, required: true, default: 0 },
  mediaRevision: { type: Number, required: true, default: 0 },
  answers: { type: Schema.Types.Mixed, required: true, default: () => ({}) },
}, { timestamps: true, strict: "throw", versionKey: false, minimize: false });
applicationSchema.index({ applicantId: 1, track: 1 }, { unique: true, partialFilterExpression: { active: true } });
applicationSchema.index({ ownerId: 1, _id: -1 });
applicationSchema.index({ status: 1, createdAt: 1 });
const submissionSchema = new Schema({ applicationId: { type: Schema.Types.ObjectId, required: true, immutable: true }, revision: { type: Number, required: true, immutable: true }, snapshot: { type: Schema.Types.Mixed, required: true, immutable: true }, submittedBy: { type: Schema.Types.ObjectId, required: true, immutable: true } }, { timestamps: true, strict: "throw", minimize: false });
submissionSchema.index({ applicationId: 1, revision: 1 }, { unique: true });
const transitionSchema = new Schema({ applicationId: { type: Schema.Types.ObjectId, required: true }, from: { type: String, required: true }, to: { type: String, required: true }, actorId: { type: Schema.Types.ObjectId, required: true }, version: { type: Number, required: true }, publicMessage: String }, { timestamps: true, strict: "throw" });
transitionSchema.index({ applicationId: 1, version: 1 }, { unique: true });
const noteSchema = new Schema({ applicationId: { type: Schema.Types.ObjectId, required: true }, actorId: { type: Schema.Types.ObjectId, required: true }, body: { type: String, required: true, maxlength: 2000 } }, { timestamps: true, strict: "throw" }); noteSchema.index({ applicationId: 1, createdAt: -1 });
export function createApplicationModels(connection: Connection) {
  return { Note: connection.models.ReviewNote as ReturnType<typeof buildNote> ?? buildNote(), Submission: connection.models.ApplicationSubmission as ReturnType<typeof buildSubmission> ?? buildSubmission(), Transition: connection.models.ApplicationTransition as ReturnType<typeof buildTransition> ?? buildTransition(), Profile: connection.models.ApplicantProfile as ReturnType<typeof buildProfile> ?? buildProfile(), Application: connection.models.Application as ReturnType<typeof buildApplication> ?? buildApplication() };
  function buildNote() { return connection.model("ReviewNote", noteSchema); }
  function buildSubmission() { return connection.model("ApplicationSubmission", submissionSchema); }
  function buildTransition() { return connection.model("ApplicationTransition", transitionSchema); }
  function buildProfile() { return connection.model("ApplicantProfile", profileSchema); }
  function buildApplication() { return connection.model("Application", applicationSchema); }
}
export type ApplicationModels = ReturnType<typeof createApplicationModels>;
