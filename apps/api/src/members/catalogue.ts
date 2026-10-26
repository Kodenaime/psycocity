import express from "express";
import { Types } from "mongoose";
import { publicModelQuerySchema } from "@psycocity/validation";
import type { IdentityService } from "../identity/service.js";
import type { PrivateStorage } from "../media/storage.js";
import { createMediaModel } from "../media/models.js";
import { createProfileModels } from "./profiles-models.js";
import { createPublicationReader } from "./publication.js";
import { sendError } from "../http.js";
export function createCatalogueRouter(identity: IdentityService, storage: PrivateStorage | null) {
  const router = express.Router(); const {Draft} = createProfileModels(identity.models.User.db); const reader = createPublicationReader(identity); const Media = createMediaModel(identity.models.User.db);
  router.use((_request, response, next) => {response.set("Cache-Control", "no-store"); next();});
  router.get("/", async (request, response) => {
    const parsed = publicModelQuerySchema.safeParse(request.query); if (!parsed.success) {sendError(response, 400, "INVALID_REQUEST", "Check catalogue filters"); return;}
    const query = parsed.data; const candidates = await Draft.find({visible: true, publishedRevisionId: {$ne: null}, ...(query.cursor ? {_id: {$lt: new Types.ObjectId(query.cursor)}} : {})}).sort({_id: -1}).limit(101).select("memberId").lean();
    const items = []; let scanned = 0;
    for (const candidate of candidates.slice(0,100)) {
      scanned++; const value = await reader.read(String(candidate.memberId));
      if (value && (!query.category || value.categories.includes(query.category)) && (!query.gender || value.gender === query.gender) && (query.minAge === undefined || value.age >= query.minAge) && (query.maxAge === undefined || value.age <= query.maxAge) && (query.minHeight === undefined || value.heightCm >= query.minHeight) && (query.maxHeight === undefined || value.heightCm <= query.maxHeight)) items.push(value);
      if (items.length >= query.limit) break;
    }
    response.json({items, nextCursor: scanned < candidates.length ? String(candidates[scanned - 1]!._id) : null});
  });
  router.get("/:id", async (request, response) => {const value = /^[0-9a-f]{24}$/.test(String(request.params.id)) ? await reader.read(String(request.params.id)) : null; if (!value) {sendError(response, 404, "NOT_FOUND", "Model profile is unavailable"); return;} response.json(value);});
  router.get("/:id/photos/:photoId", async (request, response) => {
    const value = /^[0-9a-f]{24}$/.test(String(request.params.id)) ? await reader.read(String(request.params.id)) : null;
    if (!value || !value.photos.some(photo => photo.id === request.params.photoId)) {sendError(response, 404, "NOT_FOUND", "Published photo unavailable"); return;}
    const asset = await Media.findOne({_id: request.params.photoId, memberId: request.params.id, retainedForSubmission: true, status: "ready"}).lean(); if (!asset || !storage) {sendError(response, 404, "NOT_FOUND", "Photo unavailable"); return;}
    response.set("Cross-Origin-Resource-Policy", "same-origin").type("image/webp").send(await storage.read(asset.storageKey, "thumb"));
  }); return router;
}
