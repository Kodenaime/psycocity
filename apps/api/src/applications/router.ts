import { cancelWithdrawnAppointments } from "../events/withdrawal.js";
import express from "express";
import { Types } from "mongoose";
import { applicationListQuerySchema, applicationSchema, createApplicationSchema, saveApplicationSchema, submitApplicationSchema, withdrawApplicationSchema } from "@psycocity/validation";
import { sendError } from "../http.js";
import { requireIdentity, requireRoles } from "../identity/middleware.js";
import { requireCsrf, requireVerified, sameOriginJson } from "../identity/security.js";
import type { AuthConfig } from "../identity/config.js";
import type { Identity, IdentityService } from "../identity/service.js";
import type { MailRuntime } from "../identity/auth-service.js";
import { createMediaModel } from "../media/models.js";
import { changedAnswerPaths } from "./corrections.js";
import { assessApplication } from "./requirements.js";
import { createApplicationModels } from "./models.js";

export function createApplicationRouter(identity: IdentityService, config: AuthConfig, mail: MailRuntime) {
  const router = express.Router();
  const { Profile, Application, Submission, Transition } = createApplicationModels(identity.models.User.db);
  router.use(requireIdentity(identity), requireRoles("applicant"), requireVerified);
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  function dto(value: { _id: unknown; track: unknown; status: unknown; version: unknown; answers: unknown; consentHold?: boolean; correctionFields?: string[]; correctionMessage?: string | null; submittedAt?: Date | null; withdrawnAt?: Date | null; reapplyAfter?:Date|null; updatedAt: Date }) {
    return applicationSchema.parse({ id: String(value._id), track: value.track, status: value.status, version: value.version, answers: value.answers ?? {}, consentHold: Boolean(value.consentHold), correctionFields: value.correctionFields ?? [], correctionMessage: value.correctionMessage ?? null, submittedAt: value.submittedAt?.toISOString() ?? null, withdrawnAt: value.withdrawnAt?.toISOString() ?? null, reapplyAfter:value.reapplyAfter?.toISOString()??null, updatedAt: value.updatedAt.toISOString() });
  }
  router.get("/", async (request, response) => {
    const query = applicationListQuerySchema.safeParse(request.query);
    if (!query.success) { sendError(response, 400, "INVALID_REQUEST", "Check pagination parameters"); return; }
    const userId = (response.locals.identity as Identity).userId;
    const items = await Application.find({ ownerId: userId, ...(query.data.cursor ? { _id: { $lt: new Types.ObjectId(query.data.cursor) } } : {}) }).sort({ _id: -1 }).limit(query.data.limit + 1).lean();
    const hasMore = items.length > query.data.limit;
    const page = items.slice(0, query.data.limit);
    response.json({ items: page.map(value => { const { answers: _answers, ...summary } = dto(value); return summary; }), nextCursor: hasMore ? String(page.at(-1)!._id) : null });
  });
  router.get("/eligibility",async(_request,response)=>{const user=await identity.models.User.findById((response.locals.identity as Identity).userId).select("applicationBlockedUntil").lean();const blocked=user?.applicationBlockedUntil&&user.applicationBlockedUntil>new Date();response.json({canApply:!blocked,availableAt:blocked?user.applicationBlockedUntil!.toISOString():null});});
  router.get("/:id", async (request, response) => {
    if (!/^[0-9a-fA-F]{24}$/.test(String(request.params.id))) { sendError(response, 400, "INVALID_REQUEST", "Invalid application reference"); return; }
    const value = await Application.findOne({ _id: request.params.id, ownerId: (response.locals.identity as Identity).userId }).lean();
    if (!value) { sendError(response, 404, "NOT_FOUND", "Application not found"); return; }
    response.json(dto(value));
  });
  router.get("/:id/requirements", async (request, response) => {
    if (!/^[0-9a-f]{24}$/.test(String(request.params.id))) { sendError(response, 400, "INVALID_REQUEST", "Invalid application reference"); return; }
    const application = await Application.findOne({ _id: request.params.id, ownerId: (response.locals.identity as Identity).userId }).lean();
    if (!application) { sendError(response, 404, "NOT_FOUND", "Application not found"); return; }
    const { canSubmit, issues, termsVersion, privacyVersion } = await assessApplication(application, Application.db);
    response.json({ canSubmit, issues, termsVersion, privacyVersion });
  });
  router.get("/:id/timeline", async (request, response) => {
    if (!/^[0-9a-f]{24}$/.test(String(request.params.id)) || !(await Application.exists({ _id: request.params.id, ownerId: (response.locals.identity as Identity).userId }))) { sendError(response, 404, "NOT_FOUND", "Application not found"); return; }
    const items = await Transition.find({ applicationId: request.params.id }).sort({ createdAt: 1, _id: 1 }).limit(100).lean();
    response.json({ items: items.map(value => ({ from: value.from, to: value.to, at: value.createdAt.toISOString(), ...(value.publicMessage ? { message: value.publicMessage } : {}) })) });
  });
  router.use(sameOriginJson(config.origin), requireCsrf, express.json({ limit: "32kb" }));
  router.use((request, response, next) => {
    if (!config.registrationEnabled && !/^\/[0-9a-f]{24}\/withdraw$/.test(request.path)) { sendError(response, 503, "UNAVAILABLE", "Applications are not available yet"); return; }
    next();
  });
  router.post("/", async (request, response) => {
    const input = createApplicationSchema.safeParse(request.body);
    if (!input.success) { sendError(response, 400, "INVALID_REQUEST", "Choose a valid application track"); return; }
    const ownerId = (response.locals.identity as Identity).userId;
    const existing = await Application.findOne({ ownerId, track: input.data.track, active: true }).lean();
    if (existing) { response.json(dto(existing)); return; }
    try {
      const value = await Profile.db.transaction(async session => {
        const user=await identity.models.User.findById(ownerId).session(session);if(user?.applicationBlockedUntil&&user.applicationBlockedUntil>new Date())return null;await identity.models.User.updateOne({_id:ownerId},{$inc:{applicationRevision:1}},{session});
        const profile = await Profile.findOneAndUpdate({ userId: ownerId }, { $setOnInsert: { userId: ownerId } }, { upsert: true, returnDocument: "after", session });
        const [application] = await Application.create([{ applicantId: profile!._id, ownerId, track: input.data.track, answers: {} }], { session });
        return application!;
      });
      if(!value){sendError(response,409,"CONFLICT","Your reapplication waiting period has not ended. Check the date in your applicant dashboard.");return;}
      response.status(201).json(dto(value));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === 11000) { sendError(response, 409, "CONFLICT", "An active application already exists. Refresh to continue."); return; }
      throw error;
    }
  });
  router.post("/:id/submit", async (request, response) => {
    const input = submitApplicationSchema.safeParse(request.body);
    if (!input.success || !/^[0-9a-f]{24}$/.test(String(request.params.id))) { sendError(response, 400, "INVALID_REQUEST", "Confirm the current declarations and application reference"); return; }
    if (!mail) { sendError(response, 503, "UNAVAILABLE", "Application notifications are unavailable. Your draft is retained."); return; }
    const actor = response.locals.identity as Identity;
    const outcome = await Application.db.transaction(async session => {
      const application = await Application.findOne({ _id: request.params.id, ownerId: actor.userId }).session(session);
      if (!application) return { kind: "not_found" as const };
      if (application.submittedAt && !["withdrawn", "corrections_requested"].includes(application.status)) return { kind: "success" as const, application };
      if (!["draft", "corrections_requested"].includes(application.status) || application.version !== input.data.version) return { kind: "conflict" as const };
      const user=await identity.models.User.findById(actor.userId).session(session);if(user?.applicationBlockedUntil&&user.applicationBlockedUntil>new Date())return{kind:"invalid" as const,issues:[{path:"reapplication",message:`You may apply again from ${user.applicationBlockedUntil.toLocaleString("en-NG",{timeZone:"Africa/Lagos"})} WAT.`}]};await identity.models.User.updateOne({_id:actor.userId},{$inc:{applicationRevision:1}},{session});
      const assessment = await assessApplication(application, Application.db, session);
      if (!assessment.canSubmit) return { kind: "invalid" as const, issues: assessment.issues };
      const now = new Date(); const nextVersion = application.version + 1;
      const snapshot = { track: application.track, answers: assessment.canonicalAnswers, mediaIds: assessment.mediaIds.map(String), guardianConsentId: assessment.guardianConsentId, declarations: input.data.declarations, submittedAt: now.toISOString() };
      await Submission.create([{ applicationId: application._id, revision: nextVersion, snapshot, submittedBy: actor.userId }], { session });
      await createMediaModel(Application.db).updateMany({ _id: { $in: assessment.mediaIds } }, { $set: { retainedForSubmission: true } }, { session });
      const updated = await Application.findOneAndUpdate({ _id: application._id, status: application.status, version: input.data.version }, { $set: { status: "submitted", submittedAt: now, submittedSnapshot: snapshot, answers: assessment.canonicalAnswers, correctionFields: [], correctionMessage: null }, $inc: { version: 1 } }, { session, returnDocument: "after" });
      if (!updated) throw new Error("Concurrent submission transition");
      await Transition.create([{ applicationId: application._id, from: application.status, to: "submitted", actorId: actor.userId, version: nextVersion, publicMessage: "Application received for assessment. No payment is due before acceptance." }], { session });
      await mail.enqueue({ to: actor.email, subject: "Your Psycocity application is received", text: `Your ${application.track === "academy" ? "academy" : "agency representation"} application has been submitted for assessment.

Reference: ${application._id}

Track progress in your applicant account:
${new URL("/applicant/dashboard", config.origin).href}

Submission is free. Payment is requested only after acceptance; submission does not guarantee admission or paid work.` }, `application-submitted:${application._id}:${nextVersion}`, session);
      return { kind: "success" as const, application: updated };
    });
    if (outcome.kind === "not_found") { sendError(response, 404, "NOT_FOUND", "Application not found"); return; }
    if (outcome.kind === "conflict") { sendError(response, 409, "CONFLICT", "The draft changed or is locked. Refresh before submitting."); return; }
    if (outcome.kind === "invalid") { sendError(response, 422, "INVALID_REQUEST", "Complete the application requirements before submitting", outcome.issues); return; }
    response.json(dto(outcome.application));
  });
  router.post("/:id/withdraw", async (request, response) => {
    const input = withdrawApplicationSchema.safeParse(request.body);
    if (!input.success || !/^[0-9a-f]{24}$/.test(String(request.params.id))) { sendError(response, 400, "INVALID_REQUEST", "Check the application reference and version"); return; }
    const actor = response.locals.identity as Identity;
    const outcome = await Application.db.transaction(async session => {
      const application = await Application.findOne({ _id: request.params.id, ownerId: actor.userId }).session(session);
      if (!application) return null;
      if (application.status === "withdrawn") return application;
      if (application.version !== input.data.version || ["accepted", "rejected"].includes(application.status)) return false;
      const updated = await Application.findOneAndUpdate({ _id: application._id, version: input.data.version }, { $set: { status: "withdrawn", active: false, withdrawnAt: new Date() }, $inc: { version: 1 } }, { session, returnDocument: "after" });
      if (!updated) return false;
      await cancelWithdrawnAppointments(Application.db, application._id, actor.email, config.origin, mail, session);
      await Transition.create([{ applicationId: application._id, from: application.status, to: "withdrawn", actorId: actor.userId, version: updated.version, publicMessage: "You withdrew this application." }], { session });
      if (mail) await mail.enqueue({ to: actor.email, subject: "Your Psycocity application was withdrawn", text: `Application ${application._id} is withdrawn. Its assessment history is retained under the applicable policy. Contact the agency if this was unexpected.` }, `application-withdrawn:${application._id}:${updated.version}`, session);
      return updated;
    });
    if (outcome === null) { sendError(response, 404, "NOT_FOUND", "Application not found"); return; }
    if (outcome === false) { sendError(response, 409, "CONFLICT", "The application changed or needs staff assistance to withdraw"); return; }
    response.json(dto(outcome));
  });
  router.patch("/:id", async (request, response) => {
    const input = saveApplicationSchema.safeParse(request.body);
    if (!input.success || !/^[0-9a-fA-F]{24}$/.test(String(request.params.id))) { sendError(response, 400, "INVALID_REQUEST", "Check application fields and reference"); return; }
    const ownerId = (response.locals.identity as Identity).userId;
    const existing = await Application.findOne({ _id: request.params.id, ownerId }).lean();
    if (!existing) { sendError(response, 404, "NOT_FOUND", "Application not found"); return; }
    if (existing.version !== input.data.version || !["draft", "corrections_requested"].includes(existing.status)) { sendError(response, 409, "CONFLICT", "This application changed or is locked. Refresh before saving."); return; }
    if (existing.status === "corrections_requested" && ((input.data.track && input.data.track !== existing.track) || changedAnswerPaths(existing.answers ?? {}, input.data.answers).some(path => !new Set<string>(existing.correctionFields ?? []).has(path)))) {
      sendError(response, 403, "FORBIDDEN", "Only the fields requested by staff can be changed"); return;
    }
    try {
      const value = await Application.findOneAndUpdate({ _id: existing._id, ownerId, version: existing.version, status: existing.status }, { $set: { answers: input.data.answers, ...(input.data.track ? { track: input.data.track } : {}) }, $inc: { version: 1 } }, { returnDocument: "after", runValidators: true }).lean();
      if (!value) { sendError(response, 409, "CONFLICT", "This application changed or is locked. Refresh before saving."); return; }
      response.json(dto(value));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === 11000) { sendError(response, 409, "CONFLICT", "You already have an active application for that track"); return; }
      throw error;
    }
  });
  return router;
}
