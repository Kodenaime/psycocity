import express from "express";
import { randomUUID } from "node:crypto";
import { z, completeProfessionalSchema } from "@psycocity/validation";
import type { Identity, IdentityService } from "../identity/service.js";
import type { AuthConfig } from "../identity/config.js";
import { requireIdentity } from "../identity/middleware.js";
import { requireVerified, requireCsrf, sameOriginJson } from "../identity/security.js";
import { createRateLimitModel, createRateLimiter } from "../identity/rate-limit.js";
import { hashToken, newToken } from "../identity/service.js";
import { createMediaModel } from "../media/models.js";
import { maxUploadBytes, prepareImage } from "../media/images.js";
import type { PrivateStorage } from "../media/storage.js";
import { createMemberGuard } from "./guard.js";
import { createProfileModels } from "./profiles-models.js";
import { sendError } from "../http.js";
export function createPortfolioRouter(identity: IdentityService, config: AuthConfig, storage: PrivateStorage | null) {
  const router = express.Router(); const connection = identity.models.User.db; const guard = createMemberGuard(identity); const Media = createMediaModel(connection); const {Draft, Revision} = createProfileModels(connection); const limit = createRateLimiter(createRateLimitModel(connection));
  const validId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{24}$/.test(id);
  router.use(requireIdentity(identity), requireVerified, (_request, response, next) => {response.set("Cache-Control", "private, no-store"); next();});
  router.get("/", async (_request, response) => {
    const actor = response.locals.identity as Identity; const proof = await guard(actor, "model"); if (!proof) {sendError(response, 403, "FORBIDDEN", "Model membership is required"); return;}
    const assets = await Media.find({memberId: proof.member._id, ownerId: actor.userId, active: true, status: "ready"}).sort({_id: 1}).limit(20).lean();
    response.json({items: assets.map(value => ({id: String(value._id), slot: "portfolio", width: value.width, height: value.height, bytes: value.bytes, previewUrl: `/api/v1/media/${value._id}/preview`}))});
  });
  router.use((request, response, next) => {if (request.get("Origin") !== config.origin || request.get("X-Requested-With") !== "Psycocity") {sendError(response, 403, "FORBIDDEN", "Request origin could not be verified"); return;} next();}, requireCsrf);
  router.post("/uploads", sameOriginJson(config.origin), express.json({limit: "1kb"}), async (_request, response) => {
    const actor = response.locals.identity as Identity; if (!storage || !config.registrationEnabled) {sendError(response, 503, "UNAVAILABLE", "Private image storage is unavailable"); return;}
    const proof = await guard(actor, "model"); if (!proof) {sendError(response, 403, "FORBIDDEN", "Model membership is required"); return;}
    if (!(await limit("portfolio-upload", actor.userId, 30))) {sendError(response, 429, "RATE_LIMITED", "Please wait before uploading more images"); return;}
    const token = newToken(); const expiresAt = new Date(Date.now() + 5 * 60_000);
    const asset = await Media.create({ownerId: actor.userId, memberId: proof.member._id, slot: "portfolio", storageKey: randomUUID(), uploadTokenHash: hashToken(token), expiresAt});
    response.status(201).json({assetId: String(asset._id), uploadUrl: `/api/v1/member/portfolio/uploads/${asset._id}`, uploadToken: token, expiresAt: expiresAt.toISOString(), maxBytes: maxUploadBytes});
  });
  router.put("/uploads/:id", async (request, response, next) => {
    const actor = response.locals.identity as Identity; const proof = await guard(actor, "model"); const token = request.get("X-Upload-Token");
    if (!storage || !config.registrationEnabled || !proof || !validId(request.params.id) || !token || !/^[0-9a-f]{64}$/.test(token) || !(await Media.exists({_id: request.params.id, ownerId: actor.userId, memberId: proof.member._id, uploadTokenHash: hashToken(token), status: "pending", expiresAt: {$gt: new Date()}}))) {sendError(response, 403, "FORBIDDEN", "Upload authorization is invalid or eligibility changed"); return;}
    if (!(await limit("portfolio-body", actor.userId, 30))) {sendError(response, 429, "RATE_LIMITED", "Please wait before retrying uploads"); return;} next();
  }, express.raw({type: ["image/jpeg", "image/png", "image/webp"], limit: maxUploadBytes}), async (request, response) => {
    const actor = response.locals.identity as Identity;
    const asset = await Media.findOneAndUpdate({_id: request.params.id, ownerId: actor.userId, memberId: {$exists: true}, status: "pending", uploadTokenHash: hashToken(request.get("X-Upload-Token") ?? ""), expiresAt: {$gt: new Date()}}, {$set: {status: "processing"}, $unset: {uploadTokenHash: 1}}, {returnDocument: "after"});
    if (!asset) {sendError(response, 403, "FORBIDDEN", "Upload key was already used"); return;}
    let stage: "image" | "storage" | "finalize" = "image";
    try {
      if (!Buffer.isBuffer(request.body)) throw new Error("Invalid image"); const image = await prepareImage(request.body, request.get("Content-Type")?.split(";")[0] ?? ""); stage = "storage"; await storage!.write(asset.storageKey, image); stage = "finalize";
      await connection.transaction(async session => {
        const proof = await guard(actor, "model", session); if (!proof || String(proof.member._id) !== String(asset.memberId)) throw new Error("Eligibility changed");
        await Draft.findOneAndUpdate({memberId: proof.member._id}, {$inc: {mediaRevision: 1}, $setOnInsert: {data: {}}}, {session, upsert: true});
        if (await Media.countDocuments({memberId: proof.member._id, active: true, status: "ready"}).session(session) >= 20) throw new Error("Portfolio limit reached");
        await Media.updateOne({_id: asset._id, status: "processing"}, {$set: {status: "ready", active: true, width: image.width, height: image.height, bytes: image.bytes}}, {session});
      }); response.json({message: "Portfolio photo uploaded privately"});
    } catch {await Media.updateOne({_id: asset._id}, {$set: {active: false, status: "rejected"}}); sendError(response, stage === "image" ? 400 : stage === "storage" ? 503 : 409, stage === "image" ? "INVALID_REQUEST" : stage === "storage" ? "UNAVAILABLE" : "CONFLICT", "Image could not be accepted. Check eligibility, the 20-photo limit and static JPEG/PNG/WebP requirements (200 × 200 minimum, 10 MB maximum).");}
  });
  router.post("/:id/remove", sameOriginJson(config.origin), express.json({limit: "1kb"}), async (request, response) => {
    const actor = response.locals.identity as Identity; const result = await connection.transaction(async session => {
      const proof = await guard(actor, "model", session); if (!proof || !validId(request.params.id)) return false;
      await Draft.updateOne({memberId: proof.member._id}, {$inc: {mediaRevision: 1}}, {session}); return (await Media.updateOne({_id: request.params.id, memberId: proof.member._id, ownerId: actor.userId, active: true}, {$set: {active: false}}, {session})).modifiedCount === 1;
    }); if (!result) {sendError(response, 409, "CONFLICT", "Photo is unavailable or membership changed"); return;} response.json({message: "Photo removed from the active collection; submitted evidence is retained"});
  });
  router.post("/submit", sameOriginJson(config.origin), express.json({limit: "1kb"}), async (request, response) => {
    const parsed = z.object({version: z.number().int().nonnegative()}).strict().safeParse(request.body); if (!parsed.success) {sendError(response, 400, "INVALID_REQUEST", "Provide the current draft version"); return;}
    const result = await connection.transaction(async session => {
      const actor = response.locals.identity as Identity; const proof = await guard(actor, "model", session); if (!proof) return false;
      const draft = await Draft.findOne({memberId: proof.member._id}).session(session); if (!draft || draft.version !== parsed.data.version) return false;
      if (draft.lastSubmittedVersion === draft.version) return true;
      if (!completeProfessionalSchema.safeParse(draft.data).success || draft.photos.length < 2 || !draft.coverId || !draft.photos.some(photo => photo.id === draft.coverId) || draft.photos.some(photo => !photo.alt?.trim())) return false;
      if (await Media.countDocuments({_id: {$in: draft.photos.map(photo => photo.id)}, memberId: proof.member._id, ownerId: actor.userId, status: "ready", active: true}).session(session) !== draft.photos.length) return false;
      await Revision.create([{memberId: proof.member._id, revision: draft.version, data: draft.data, photos: draft.photos, coverId: draft.coverId}], {session});
      await Media.updateMany({_id: {$in: draft.photos.map(photo => photo.id)}}, {$set: {retainedForSubmission: true}}, {session}); draft.lastSubmittedVersion = draft.version; draft.mediaRevision++; await draft.save({session}); return true;
    }); if (!result) {sendError(response, 409, "CONFLICT", "Save complete professional details, at least two owned photos with alt text and a cover before submission. Refresh if the draft changed."); return;} response.json({message: "Immutable portfolio revision submitted for staff review. It is not public."});
  }); return router;
}
