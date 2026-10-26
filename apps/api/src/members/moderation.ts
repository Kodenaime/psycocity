import express from "express";
import { Types, type ClientSession } from "mongoose";
import { pageQuerySchema, revisionReviewSchema } from "@psycocity/validation";
import type { Identity, IdentityService } from "../identity/service.js";
import type { AuthConfig } from "../identity/config.js";
import type { MailRuntime } from "../identity/auth-service.js";
import { sameOriginJson, requireCsrf } from "../identity/security.js";
import { createAdminModels } from "../admin/models.js";
import { createProfileModels } from "./profiles-models.js";
import { createMemberModels } from "./models.js";
import { createPublicationReader } from "./publication.js";
import { sendError } from "../http.js";
export function createModerationRouter(identity: IdentityService, config: AuthConfig, mail: MailRuntime, authorize: (actor: Identity, session: ClientSession) => Promise<void>) {
  const router = express.Router(); const connection = identity.models.User.db; const {Draft, Revision} = createProfileModels(connection); const {Member} = createMemberModels(connection); const {Audit} = createAdminModels(connection); const reader = createPublicationReader(identity);
  router.get("/", async (request, response) => {const parsed = pageQuerySchema.safeParse(request.query); if (!parsed.success) {sendError(response, 400, "INVALID_REQUEST", "Check revision pagination"); return;} const rows = await Revision.find(parsed.data.cursor ? {_id: {$lt: new Types.ObjectId(parsed.data.cursor)}} : {}).sort({_id: -1}).limit(parsed.data.limit + 1).lean(); const items = rows.slice(0, parsed.data.limit); response.json({items: items.map(value => ({id: String(value._id), memberId: String(value.memberId), professionalName: value.data.professionalName, revision: value.revision, status: value.status})), nextCursor: rows.length > parsed.data.limit ? String(items.at(-1)!._id) : null});});
  router.get("/:id", async (request, response) => {
    if (!/^[0-9a-f]{24}$/.test(String(request.params.id))) {sendError(response, 404, "NOT_FOUND", "Revision not found"); return;}
    const revision = await Revision.findById(request.params.id).lean(); const draft = revision ? await Draft.findOne({memberId: revision.memberId}).lean() : null; if (!revision || !draft) {sendError(response, 404, "NOT_FOUND", "Revision not found"); return;}
    const [previous, member] = await Promise.all([draft.publishedRevisionId ? Revision.findById(draft.publishedRevisionId).lean() : null, Member.findById(revision.memberId).lean()]);
    response.json({id: String(revision._id), memberId: String(revision.memberId), revision: revision.revision, status: revision.status, data: revision.data, photos: revision.photos, coverId: revision.coverId, publicationVersion: draft.publicationRevision, visible: draft.visible, selfReview: String(member?.userId) === (response.locals.identity as Identity).userId, previous: previous ? {data: previous.data, photos: previous.photos} : null});
  });
  router.post("/:id/review", sameOriginJson(config.origin), requireCsrf, express.json({limit: "4kb"}), async (request, response) => {
    const input = revisionReviewSchema.safeParse(request.body); if (!input.success || !/^[0-9a-f]{24}$/.test(String(request.params.id))) {sendError(response, 400, "INVALID_REQUEST", "Provide a review action, reason and publication version"); return;}
    const actor = response.locals.identity as Identity;
    try {
      const result = await connection.transaction(async session => {
        await authorize(actor, session); const revision = await Revision.findById(request.params.id).session(session); const member = revision ? await Member.findById(revision.memberId).session(session) : null; const draft = member ? await Draft.findOne({memberId: member._id}).session(session) : null;
        if (!revision || !member || !draft || String(member.userId) === actor.userId || draft.publicationRevision !== input.data.publicationVersion) return false;
        const owner = await identity.models.User.findById(member.userId).session(session); if (!owner) return false;
        const action = input.data.action;
        if (["approve_publish", "reject", "changes_required"].includes(action)) {
          if (revision.status !== "pending" || !mail) return false;
          if (action === "approve_publish" && !(await reader.proof(String(member._id), session))) return false;
          revision.status = action === "approve_publish" ? "approved" : action === "reject" ? "rejected" : "changes_required"; revision.feedback = input.data.reason; revision.reviewedBy = new Types.ObjectId(actor.userId); revision.reviewedAt = new Date(); await Revision.updateOne({_id: revision._id, status: "pending"}, {$set: {status: revision.status, feedback: revision.feedback, reviewedBy: revision.reviewedBy, reviewedAt: revision.reviewedAt}}, {session});
          if (action === "approve_publish") {draft.publishedRevisionId = revision._id; draft.visible = true;}
          await mail.enqueue({to: owner.emailNormalized, subject: "Your Psycocity portfolio review", text: `${input.data.reason}\nRevision ${revision.revision}: ${revision.status}.\n${new URL("/member/model", config.origin).href}`}, `portfolio-review:${revision._id}:${revision.status}`, session);
        } else if (action === "hide") draft.visible = false;
        else if (action === "unhide") {if (!draft.publishedRevisionId || !(await reader.proof(String(member._id), session))) return false; const published = await Revision.findOne({_id: draft.publishedRevisionId, status: "approved"}).session(session); if (!published) return false; draft.visible = true;}
        else {
          if (owner.roles.includes("admin")) return false;
          owner.status = "suspended"; await owner.save({session}); await identity.models.Session.updateMany({userId: owner._id, revokedAt: null}, {$set: {revokedAt: new Date()}}, {session}); draft.visible = false;
        }
        draft.publicationRevision++; await draft.save({session}); await Audit.create([{actorId: actor.userId, action: `portfolio.${action}`, entityId: revision._id, summary: {reason: input.data.reason}}], {session}); return true;
      }); if (!result) {sendError(response, 409, "CONFLICT", "Review changed, membership is ineligible or this action requires another staff member. Refresh."); return;} response.json({message: "Portfolio moderation recorded"});
    } catch {sendError(response, 409, "CONFLICT", "Review could not be committed. Refresh and check staff verification/email availability.");}
  }); return router;
}
