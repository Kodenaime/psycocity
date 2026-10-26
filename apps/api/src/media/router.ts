import express from "express";
import { photoEditable } from "../applications/corrections.js";
import { guardianStatus } from "../guardian/service.js";
import { randomUUID } from "node:crypto";
import { uploadRequestSchema } from "@psycocity/validation";
import { sendError } from "../http.js";
import { requireIdentity } from "../identity/middleware.js";
import { requireCsrf, requireVerified, sameOriginJson } from "../identity/security.js";
import { hashToken, newToken, type IdentityService, type Identity } from "../identity/service.js";
import { createRateLimiter, createRateLimitModel } from "../identity/rate-limit.js";
import type { AuthConfig } from "../identity/config.js";
import { createApplicationModels } from "../applications/models.js";
import { createMediaModel } from "./models.js";
import { maxUploadBytes, prepareImage } from "./images.js";
import type { PrivateStorage } from "./storage.js";

export function createMediaRouter(identity: IdentityService, config: AuthConfig, storage: PrivateStorage | null) {
  const router = express.Router();
  const model = createMediaModel(identity.models.User.db);
  const { Application } = createApplicationModels(identity.models.User.db);
  const limit = createRateLimiter(createRateLimitModel(identity.models.User.db));
  router.use(requireIdentity(identity));
  router.use((_request, response, next) => { response.set({ "Cache-Control": "private, no-store", "Cross-Origin-Resource-Policy": "same-origin" }); next(); });
  const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{24}$/.test(value);
  router.get("/application/:id", async (request, response) => {
    const actor = response.locals.identity as Identity;
    if (!validId(request.params.id) || !(await Application.exists({ _id: request.params.id, ownerId: actor.userId }))) { sendError(response, 404, "NOT_FOUND", "Application not found"); return; }
    const items = await model.find({ applicationId: request.params.id, ownerId: actor.userId, active: true, status: "ready" }).sort({ createdAt: 1 }).limit(30).lean();
    response.json({ items: items.map(value => ({ id: String(value._id), slot: value.slot, width: value.width, height: value.height, bytes: value.bytes, previewUrl: `/api/v1/media/${value._id}/preview` })) });
  });
  router.get("/:id/preview", async (request, response) => {
    const actor = response.locals.identity as Identity;
    if (!validId(request.params.id)) { sendError(response, 404, "NOT_FOUND", "Photo not found"); return; }
    const asset = await model.findOne({ _id: request.params.id, status: "ready", $and: [{ $or: [{ active: true }, { retainedForSubmission: true }] }, { $or: [{ ownerId: actor.userId }, ...(actor.roles.includes("admin") ? [{ retainedForSubmission: true }] : [])] }] }).lean();
    if (!asset) { sendError(response, 404, "NOT_FOUND", "Photo not found"); return; }
    if (!storage) { sendError(response, 503, "UNAVAILABLE", "Photo storage is unavailable"); return; }
    response.type("image/webp").send(await storage.read(asset.storageKey, request.query.variant === "image" ? "image" : "thumb"));
  });
  router.use(requireVerified, (request, response, next) => {
    if (!storage || !config.registrationEnabled) { sendError(response, 503, "UNAVAILABLE", "Photo uploads are not available yet"); return; }
    if (request.get("Origin") !== config.origin || request.get("X-Requested-With") !== "Psycocity") { sendError(response, 403, "FORBIDDEN", "This request could not be verified"); return; }
    next();
  }, requireCsrf);
  router.post("/uploads", sameOriginJson(config.origin), express.json({ limit: "4kb" }), async (request, response) => {
    const input = uploadRequestSchema.safeParse(request.body);
    if (!input.success) { sendError(response, 400, "INVALID_REQUEST", "Choose an application and photo type"); return; }
    const actor = response.locals.identity as Identity;
    const application = await Application.findOne({ _id: input.data.applicationId, ownerId: actor.userId, status: { $in: ["draft", "corrections_requested"] } }).lean();
    if (!application) { sendError(response, 404, "NOT_FOUND", "Editable application not found"); return; }
    if (!photoEditable(application, input.data.slot)) { sendError(response, 403, "FORBIDDEN", "Only requested photo views can be changed"); return; }
    if (!(await guardianStatus(application, Application.db)).canUpload) { sendError(response, 403, "FORBIDDEN", "Save eligible personal details and complete any required guardian consent before uploading photos"); return; }
    if (!(await limit("uploads:user", actor.userId, 30))) { sendError(response, 429, "RATE_LIMITED", "Please wait before uploading more photos"); return; }
    const token = newToken(); const expiresAt = new Date(Date.now() + 5 * 60_000);
    const asset = await model.create({ ownerId: actor.userId, applicationId: application._id, slot: input.data.slot, storageKey: randomUUID(), uploadTokenHash: hashToken(token), expiresAt });
    response.status(201).json({ assetId: String(asset._id), uploadUrl: `/api/v1/media/uploads/${asset._id}`, uploadToken: token, expiresAt: expiresAt.toISOString(), maxBytes: maxUploadBytes });
  });
  router.put("/uploads/:id", async (request, response, next) => {
    const actor = response.locals.identity as Identity;
    const token = request.get("X-Upload-Token");
    if (!(await limit("upload-body:user", actor.userId, 30))) { sendError(response, 429, "RATE_LIMITED", "Please wait before uploading more photos"); return; }
    if (!validId(request.params.id) || !token || !/^[0-9a-f]{64}$/.test(token)) { sendError(response, 403, "FORBIDDEN", "Invalid or expired upload authorization"); return; }
    const grant = await model.findOne({ _id: request.params.id, ownerId: actor.userId, status: "pending", uploadTokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).select("applicationId slot").lean();
    const current = grant ? await Application.findOne({ _id: grant.applicationId, ownerId: actor.userId, status: { $in: ["draft", "corrections_requested"] } }).lean() : null;
    if (!current || !photoEditable(current, grant!.slot) || !(await guardianStatus(current, Application.db)).canUpload) { sendError(response, 403, "FORBIDDEN", "Invalid upload authorization or consent changed"); return; }
    next();
  }, express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: maxUploadBytes }), async (request, response) => {
    const actor = response.locals.identity as Identity;
    const token = request.get("X-Upload-Token");
    if (!validId(request.params.id) || !token || !/^[0-9a-f]{64}$/.test(token)) { sendError(response, 403, "FORBIDDEN", "Invalid upload authorization"); return; }
    const asset = await model.findOneAndUpdate({ _id: request.params.id, ownerId: actor.userId, status: "pending", uploadTokenHash: hashToken(token), expiresAt: { $gt: new Date() } }, { $set: { status: "processing" }, $unset: { uploadTokenHash: 1 } }, { returnDocument: "after" }).lean();
    if (!asset) { sendError(response, 403, "FORBIDDEN", "Upload authorization is expired or already used"); return; }
    let stage: "image" | "storage" | "finalize" = "image";
    try {
      if (!Buffer.isBuffer(request.body)) throw new Error("Unsupported file type");
      const image = await prepareImage(request.body, request.get("Content-Type")?.split(";")[0] ?? "");
      stage = "storage";
      await storage!.write(asset.storageKey, image);
      stage = "finalize";
      await Application.db.transaction(async session => {
        const current = await Application.findById(asset.applicationId).session(session).lean();
        if (!current || !photoEditable(current, asset.slot) || !(await guardianStatus(current, Application.db, session)).canUpload) throw new Error("Consent or eligibility changed");
        const locked = await Application.updateOne({ _id: asset.applicationId, ownerId: actor.userId, status: { $in: ["draft", "corrections_requested"] } }, { $inc: { mediaRevision: 1 } }, { session });
        if (locked.modifiedCount !== 1) throw new Error("Application is locked");
        if (asset.slot === "portfolio") {
          if (await model.countDocuments({ applicationId: asset.applicationId, slot: "portfolio", active: true, status: "ready" }).session(session) >= 10) throw new Error("Portfolio limit reached");
        } else {
          await model.updateMany({ applicationId: asset.applicationId, slot: asset.slot, active: true }, { $set: { active: false } }, { session });
        }
        await model.updateOne({ _id: asset._id, status: "processing" }, { $set: { active: true, status: "ready", width: image.width, height: image.height, bytes: image.bytes } }, { session });
      });
      response.json({ message: "Photo uploaded privately" });
    } catch {
      await model.updateOne({ _id: asset._id }, { $set: { status: "rejected", active: false }, $unset: { purgedAt: 1 } });
      if (stage === "storage") { sendError(response, 503, "UNAVAILABLE", "Photo storage is temporarily unavailable. Please try again later."); return; }
      if (stage === "finalize") { sendError(response, 409, "CONFLICT", "The application changed or the photo limit was reached. Refresh your photos before retrying."); return; }
      sendError(response, 400, "INVALID_REQUEST", "Could not accept this photo. Use a static JPEG, PNG or WebP, at least 200 × 200 pixels and at most 10 MB. Check the application is editable and portfolio limit is not reached.");
    }
  });
  router.post("/:id/remove", sameOriginJson(config.origin), express.json({ limit: "1kb" }), async (request, response) => {
    const actor = response.locals.identity as Identity;
    if (!validId(request.params.id)) { sendError(response, 404, "NOT_FOUND", "Photo not found"); return; }
    const asset = await model.findOne({ _id: request.params.id, ownerId: actor.userId, active: true }).lean();
    if (!asset) { sendError(response, 404, "NOT_FOUND", "Photo not found"); return; }
    const editable = await Application.findById(asset.applicationId).lean();
    if (!editable || !photoEditable(editable, asset.slot)) { sendError(response, 403, "FORBIDDEN", "Only requested photo views can be removed"); return; }
    const removed = await Application.db.transaction(async session => {
      const current = await Application.findById(asset.applicationId).session(session).lean();
      if (!current || !photoEditable(current, asset.slot)) return false;
      const locked = await Application.updateOne({ _id: asset.applicationId, ownerId: actor.userId, status: { $in: ["draft", "corrections_requested"] } }, { $inc: { mediaRevision: 1 } }, { session });
      if (locked.modifiedCount !== 1) return false;
      await model.updateOne({ _id: asset._id }, { $set: { active: false } }, { session }); return true;
    });
    if (!removed) { sendError(response, 409, "CONFLICT", "This application is locked"); return; }
    response.json({ message: "Photo removed from application" });
  });
  return router;
}
