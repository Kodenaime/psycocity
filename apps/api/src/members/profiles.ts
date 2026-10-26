import { createPublicationReader } from "./publication.js";
import express from "express";
import { completeProfessionalSchema, privateMemberProfileSchema, professionalDraftDataSchema, savePrivateMemberProfileSchema, saveProfessionalDraftSchema } from "@psycocity/validation";
import type { Identity, IdentityService } from "../identity/service.js";
import type { AuthConfig } from "../identity/config.js";
import { requireIdentity } from "../identity/middleware.js";
import { requireVerified, requireCsrf, sameOriginJson } from "../identity/security.js";
import { sendError } from "../http.js";
import { createApplicationModels } from "../applications/models.js";
import { createMemberGuard } from "./guard.js";
import { createProfileModels } from "./profiles-models.js";
import { createMediaModel } from "../media/models.js";
export function createProfileRouter(identity: IdentityService, config: AuthConfig) {
  const router = express.Router(); const connection = identity.models.User.db; const {Private, Draft, Revision} = createProfileModels(connection); const guard = createMemberGuard(identity); const Media = createMediaModel(connection);
  router.use(requireIdentity(identity), requireVerified, (_request, response, next) => {response.set("Cache-Control", "no-store"); next();});
  router.get("/:type/profile", async (request, response) => {
    const type = request.params.type; const actor = response.locals.identity as Identity; const proof = type === "student" || type === "model" ? await guard(actor, type) : null;
    if (!proof) {sendError(response, 403, "FORBIDDEN", "Active paid membership is required"); return;}
    const profile = await Private.findOneAndUpdate({memberId: proof.member._id}, {$setOnInsert: {memberId: proof.member._id, data: {}}}, {upsert: true, returnDocument: "after"}).lean();
    const data = privateMemberProfileSchema.parse(profile!.data); const application = await createApplicationModels(connection).Application.findById(proof.entitlement.applicationId).select("submittedSnapshot").lean();
    response.json({memberId: String(proof.member._id), type, version: profile!.version, data, complete: Boolean(data.preferredName && data.phone && data.address), birthDate: application?.submittedSnapshot?.answers?.personal?.birthDate ?? ""});
  });
  router.get("/model/professional", async (_request, response) => {
    const proof = await guard(response.locals.identity as Identity, "model"); if (!proof) {sendError(response, 403, "FORBIDDEN", "Represented model membership is required"); return;}
    const value = await Draft.findOneAndUpdate({memberId: proof.member._id}, {$setOnInsert: {memberId: proof.member._id, data: {}}}, {upsert: true, returnDocument: "after"}).lean();
    const revisions = await Revision.find({memberId: proof.member._id}).sort({revision: -1}).limit(20).lean();
    response.json({memberId: String(proof.member._id), version: value!.version, data: professionalDraftDataSchema.parse(value!.data), photos: value!.photos, coverId: value!.coverId, complete: completeProfessionalSchema.safeParse(value!.data).success, revisions: revisions.map(item => ({id: String(item._id), revision: item.revision, status: item.status, feedback: item.feedback ?? null, submittedAt: item.createdAt.toISOString()}))});
  });
  router.get("/model/published", async (_request, response) => {const proof = await guard(response.locals.identity as Identity, "model"); const value = proof ? await createPublicationReader(identity).read(String(proof.member._id), true) : null; if (!value) {sendError(response, 404, "NOT_FOUND", "No approved profile is available for preview"); return;} response.json({...value, photos: value.photos.map(photo => ({...photo, url: `/api/v1/media/${photo.id}/preview`}))});});
  router.use(sameOriginJson(config.origin), requireCsrf, express.json({limit: "16kb"}));
  router.patch("/:type/profile", async (request, response) => {
    const parsed = savePrivateMemberProfileSchema.safeParse(request.body); const type = request.params.type;
    if (!parsed.success || !["student", "model"].includes(type)) {sendError(response, 400, "INVALID_REQUEST", "Check private contact details and version"); return;}
    const result = await connection.transaction(async session => {const proof = await guard(response.locals.identity as Identity, type as "student" | "model", session); if (!proof) return false; const changed = await Private.updateOne({memberId: proof.member._id, version: parsed.data.version}, {$set: {data: parsed.data.data}, $inc: {version: 1}}, {session}); return changed.modifiedCount === 1;});
    if (!result) {sendError(response, 409, "CONFLICT", "Profile changed or membership is unavailable. Refresh before saving."); return;} response.json({message: "Private profile saved"});
  });
  router.patch("/model/professional", async (request, response) => {
    const parsed = saveProfessionalDraftSchema.safeParse(request.body); if (!parsed.success) {sendError(response, 400, "INVALID_REQUEST", "Check professional fields, photo ordering, cover and version"); return;}
    const result = await connection.transaction(async session => {
      const actor = response.locals.identity as Identity; const proof = await guard(actor, "model", session); if (!proof) return false;
      if (parsed.data.photos.length && await Media.countDocuments({_id: {$in: parsed.data.photos.map(photo => photo.id)}, memberId: proof.member._id, ownerId: actor.userId, status: "ready", active: true}).session(session) !== parsed.data.photos.length) return false;
      return (await Draft.updateOne({memberId: proof.member._id, version: parsed.data.version}, {$set: {data: parsed.data.data, photos: parsed.data.photos, coverId: parsed.data.coverId}, $inc: {version: 1}}, {session})).modifiedCount === 1;
    });
    if (!result) {sendError(response, 409, "CONFLICT", "Draft changed, photos are unavailable or model membership is ineligible. Refresh."); return;} response.json({message: "Professional draft saved privately; publication requires staff approval"});
  });
  return router;
}
