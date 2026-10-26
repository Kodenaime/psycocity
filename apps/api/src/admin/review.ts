import express from "express";
import { Types, type ClientSession } from "mongoose";
import { ageOn, applicationSchema, draftAnswersSchema, lagosDate, reviewActionSchema, reviewNoteRequestSchema, reviewQueueQuerySchema } from "@psycocity/validation";
import type { Identity, IdentityService } from "../identity/service.js";
import type { MailRuntime } from "../identity/auth-service.js";
import type { AuthConfig } from "../identity/config.js";
import { requireCsrf, sameOriginJson } from "../identity/security.js";
import { createApplicationModels } from "../applications/models.js";
import { createMediaModel } from "../media/models.js";
import { createGuardianModel } from "../guardian/models.js";
import { createAdminModels } from "./models.js";
import { AdminActionError } from "./service.js";
import { sendError } from "../http.js";

export function createReviewRouter(identity: IdentityService, mail: MailRuntime, config: AuthConfig, authorize: (actor: Identity, session: ClientSession) => Promise<void>) {
  const router = express.Router(); const connection = identity.models.User.db;
  const { Application, Transition, Note } = createApplicationModels(connection); const { Audit } = createAdminModels(connection);
  const valid = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{24}$/.test(id);
  router.get("/", async (request, response) => {
    const parsed = reviewQueueQuerySchema.safeParse(request.query);
    if (!parsed.success) { sendError(response, 400, "INVALID_REQUEST", "Check review filters and pagination"); return; }
    const input = parsed.data; const today = lagosDate();
    const age = { $subtract: [{ $subtract: [Number(today.slice(0, 4)), { $convert: { input: { $substrBytes: ["$submittedSnapshot.answers.personal.birthDate", 0, 4] }, to: "int", onError: null, onNull: null } }] }, { $cond: [{ $gt: [{ $substrBytes: ["$submittedSnapshot.answers.personal.birthDate", 5, 5] }, today.slice(5)] }, 1, 0] }] };
    const ageFilters = [...(input.minAge !== undefined ? [{ $gte: [age, input.minAge] }] : []), ...(input.maxAge !== undefined ? [{ $lte: [age, input.maxAge] }] : [])];
    const rows = await Application.find({ submittedAt: { $ne: null, ...(input.from ? { $gte: new Date(`${input.from}T00:00:00+01:00`) } : {}), ...(input.through ? { $lt: new Date(new Date(`${input.through}T00:00:00+01:00`).getTime() + 24 * 60 * 60_000) } : {}) }, status: input.status ?? { $ne: "draft" }, ...(input.track ? { track: input.track } : {}), ...(input.consentHold ? { consentHold: input.consentHold === "true" } : {}), ...(input.cursor ? { _id: { $lt: new Types.ObjectId(input.cursor) } } : {}), ...(ageFilters.length ? { $expr: { $and: ageFilters } } : {}) }).sort({ _id: -1 }).limit(input.limit + 1).lean();
    const page = rows.slice(0, input.limit);
    response.json({ items: page.map(value => { const answers = draftAnswersSchema.parse(value.submittedSnapshot?.answers ?? {}); return { id: String(value._id), track: value.track, status: value.status, version: value.version, applicantName: answers.personal?.legalName ?? "Applicant", age: answers.personal?.birthDate ? ageOn(answers.personal.birthDate) : null, submittedAt: value.submittedAt!.toISOString(), consentHold: Boolean(value.consentHold) }; }), nextCursor: rows.length > input.limit ? String(page.at(-1)!._id) : null });
  });
  router.get("/:id", async (request, response) => {
    if (!valid(request.params.id)) { sendError(response, 404, "NOT_FOUND", "Application not found"); return; }
    const application = await Application.findOne({ _id: request.params.id, submittedAt: { $ne: null } }).lean();
    if (!application?.submittedSnapshot) { sendError(response, 404, "NOT_FOUND", "Submitted application not found"); return; }
    const snapshot = application.submittedSnapshot;
    const [owner, photos, guardian, notes, history] = await Promise.all([
      identity.models.User.findById(application.ownerId).select("emailNormalized").lean(),
      createMediaModel(connection).find({ _id: { $in: snapshot.mediaIds }, retainedForSubmission: true, status: "ready" }).lean(),
      snapshot.guardianConsentId ? createGuardianModel(connection).findById(snapshot.guardianConsentId).lean() : null,
      Note.find({ applicationId: application._id }).sort({ createdAt: -1 }).limit(100).lean(),
      Transition.find({ applicationId: application._id }).sort({ createdAt: 1, _id: 1 }).limit(100).lean(),
    ]);
    const actors = await identity.models.User.find({ _id: { $in: [...notes.map(value => value.actorId), ...history.map(value => value.actorId)] } }).select("emailNormalized").lean(); const labels = new Map(actors.map(value => [String(value._id), value.emailNormalized]));
    response.json({ application: applicationSchema.parse({ id: String(application._id), track: application.track, status: application.status, version: application.version, answers: snapshot.answers, consentHold: Boolean(application.consentHold), correctionFields: application.correctionFields ?? [], correctionMessage: application.correctionMessage ?? null, submittedAt: application.submittedAt?.toISOString() ?? null, withdrawnAt: application.withdrawnAt?.toISOString() ?? null, updatedAt: application.updatedAt.toISOString() }), applicantEmail: owner?.emailNormalized ?? null, selfReview: String(application.ownerId) === (response.locals.identity as Identity).userId, declarations: snapshot.declarations, photos: photos.map(value => ({ id: String(value._id), slot: value.slot, width: value.width, height: value.height, bytes: value.bytes, previewUrl: `/api/v1/media/${value._id}/preview` })), guardian: guardian ? { name: guardian.guardianName, email: guardian.guardianEmail, relationship: guardian.relationship, status: guardian.status, policyVersion: guardian.policyVersion, verifiedAt: guardian.verifiedAt?.toISOString() ?? null } : null, notes: notes.map(value => ({ id: String(value._id), body: value.body, actor: labels.get(String(value.actorId)) ?? "Former staff", at: value.createdAt.toISOString() })), history: history.map(value => ({ from: value.from, to: value.to, actor: labels.get(String(value.actorId)) ?? "Former staff", at: value.createdAt.toISOString(), ...(value.publicMessage ? { message: value.publicMessage } : {}) })) });
  });
  router.use(sameOriginJson(config.origin), requireCsrf, express.json({ limit: "8kb" }));
  router.post("/:id/actions", async (request, response) => {
    const input = reviewActionSchema.safeParse(request.body); if (!input.success || !valid(request.params.id)) { sendError(response, 400, "INVALID_REQUEST", "Choose a review action, current version and any required correction instructions"); return; }
    const actor = response.locals.identity as Identity;
    try {
      const result = await connection.transaction(async session => {
        await authorize(actor, session);
        const application = await Application.findOne({ _id: request.params.id, submittedAt: { $ne: null } }).session(session);
        if (!application) return "not_found";
        if (String(application.ownerId) === actor.userId) return "self";
        if (application.version !== input.data.version) return "conflict";
        const target = { start_review: { from: ["submitted"], to: "under_review" as const }, shortlist: { from: ["submitted", "under_review"], to: "shortlisted" as const }, record_assessment: { from: ["under_review", "shortlisted"], to: "assessed" as const }, request_corrections: { from: ["submitted", "under_review", "shortlisted", "assessed"], to: "corrections_requested" as const } }[input.data.action];
        if (!target.from.includes(application.status)) return "conflict";
        if (application.consentHold && (input.data.action !== "request_corrections" || input.data.fields?.some(field => field !== "guardian"))) return "hold";
        if (input.data.action === "request_corrections" && !mail) return "email";
        const next = application.version + 1; const fields = input.data.action === "request_corrections" ? [...new Set(input.data.fields!)] : [];
        const message = input.data.action === "request_corrections" ? input.data.publicMessage! : input.data.action === "start_review" ? "Your application is under review." : input.data.action === "shortlist" ? "Your application has been shortlisted." : "Your assessment has been recorded.";
        await Application.updateOne({ _id: application._id, version: application.version }, { $set: { status: target.to, ...(fields.length ? { correctionFields: fields, correctionMessage: message } : {}) }, $inc: { version: 1 } }, { session });
        await Transition.create([{ applicationId: application._id, from: application.status, to: target.to, actorId: actor.userId, version: next, publicMessage: message }], { session });
        if (input.data.internalNote) await Note.create([{ applicationId: application._id, actorId: actor.userId, body: input.data.internalNote }], { session });
        await Audit.create([{ actorId: actor.userId, action: `application.${input.data.action}`, entityId: application._id }], { session });
        if (input.data.action === "request_corrections") {
          const owner = await identity.models.User.findById(application.ownerId).session(session).lean();
          if (!owner) throw new Error("Applicant account unavailable");
          await mail!.enqueue({ to: owner.emailNormalized, subject: "Your Psycocity application needs an update", text: `${message}

Requested fields: ${fields.join(", ")}

Only the requested details can be edited. Sign in to review and resubmit:
${new URL(`/applicant/application/${application._id}`, config.origin).href}

No payment is due before acceptance.` }, `application-corrections:${application._id}:${next}`, session);
        }
        return "success";
      });
      if (result === "not_found") { sendError(response, 404, "NOT_FOUND", "Submitted application not found"); return; }
      if (result === "self") { sendError(response, 403, "FORBIDDEN", "Another staff member must review your own application"); return; }
      if (result === "hold") { sendError(response, 409, "CONFLICT", "Resolve the guardian consent hold before assessment"); return; }
      if (result === "email") { sendError(response, 503, "UNAVAILABLE", "Applicant notification email is unavailable"); return; }
      if (result !== "success") { sendError(response, 409, "CONFLICT", "The application changed or the review transition is not allowed. Refresh."); return; }
      response.json({ message: "Review action recorded" });
    } catch (error) { if (error instanceof AdminActionError) { sendError(response, 403, "MFA_REQUIRED", error.message); return; } throw error; }
  });
  router.post("/:id/notes", async (request, response) => {
    const input = reviewNoteRequestSchema.safeParse(request.body); if (!input.success || !valid(request.params.id)) { sendError(response, 400, "INVALID_REQUEST", "Enter an internal note and current application version"); return; }
    const actor = response.locals.identity as Identity;
    try {
      const result = await connection.transaction(async session => {
        await authorize(actor, session);
        const application = await Application.findOne({ _id: request.params.id, submittedAt: { $ne: null } }).session(session);
        if (!application || application.version !== input.data.version || ["withdrawn", "rejected"].includes(application.status)) return "conflict";
        if (String(application.ownerId) === actor.userId) return "self";
        await Application.updateOne({ _id: application._id }, { $inc: { reviewRevision: 1 } }, { session });
        await Note.create([{ applicationId: application._id, actorId: actor.userId, body: input.data.body }], { session });
        await Audit.create([{ actorId: actor.userId, action: "application.note_added", entityId: application._id }], { session }); return "success";
      });
      if (result === "self") { sendError(response, 403, "FORBIDDEN", "Another staff member must review your own application"); return; }
      if (result !== "success") { sendError(response, 409, "CONFLICT", "Application changed or is no longer reviewable"); return; }
      response.json({ message: "Internal note saved" });
    } catch (error) { if (error instanceof AdminActionError) { sendError(response, 403, "MFA_REQUIRED", error.message); return; } throw error; }
  });
  return router;
}
