import express from "express";
import { randomBytes } from "node:crypto";
import { Types, type ClientSession } from "mongoose";
import { enquiryInputSchema, enquiryUpdateSchema, pageQuerySchema, lagosDate } from "@psycocity/validation";
import { hashToken, type Identity, type IdentityService } from "../identity/service.js";
import type { AuthConfig } from "../identity/config.js";
import { sameOriginJson, requireCsrf } from "../identity/security.js";
import { createRateLimiter, createRateLimitModel } from "../identity/rate-limit.js";
import { createAdminModels } from "../admin/models.js";
import { createPublicationReader } from "../members/publication.js";
import { createEnquiryModels } from "./models.js";
import { sendError } from "../http.js";
export function createEnquiryRouters(identity: IdentityService, config: AuthConfig, authorize?: (actor: Identity, session: ClientSession) => Promise<void>) {
  const publicRouter = express.Router(); const admin = express.Router(); const connection = identity.models.User.db; const {Enquiry, Note} = createEnquiryModels(connection); const {Audit} = createAdminModels(connection); const limit = createRateLimiter(createRateLimitModel(connection));
  publicRouter.get("/capabilities", (_request, response) => {response.json({registrationAvailable: config.registrationEnabled, testMode: !config.production});});
  publicRouter.post("/", sameOriginJson(config.origin), express.json({limit: "10kb"}), async (request, response) => {
    if (!config.registrationEnabled) {sendError(response, 503, "UNAVAILABLE", "Enquiries are not available before policy approval"); return;}
    const parsed = enquiryInputSchema.safeParse(request.body); if (!parsed.success || parsed.data.projectDate && parsed.data.projectDate < lagosDate()) {sendError(response, 400, "INVALID_REQUEST", "Check contact/project details and future project date"); return;}
    if (!(await limit("public-enquiry-ip", request.ip ?? "unknown", 10)) || !(await limit("public-enquiry-email", parsed.data.email, 3, 60 * 60_000))) {sendError(response, 429, "RATE_LIMITED", "Please wait before sending another enquiry"); return;}
    const {requestKey, website: _website, ...input} = parsed.data; const fingerprint = hashToken(JSON.stringify(input));
    const existing = await Enquiry.findOne({requestKey}).select("+fingerprint").lean(); if (existing) {if (existing.fingerprint !== fingerprint) {sendError(response, 409, "CONFLICT", "This submission key was already used for different details"); return;} response.json({reference: existing.reference, message: "Your enquiry is recorded. This does not confirm a booking."}); return;}
    const model = input.modelId ? await createPublicationReader(identity).read(input.modelId) : null;
    if (input.modelId && !model) {sendError(response, 400, "INVALID_REQUEST", "Choose a currently published model or leave the preference blank"); return;}
    try {const enquiry = await Enquiry.create({...input, requestKey, fingerprint, reference: `PSYC-${randomBytes(8).toString("hex").toUpperCase()}`, ...(model ? {modelName: model.professionalName} : {})}); response.status(201).json({reference: enquiry.reference, message: "Your enquiry is recorded. This does not confirm a booking."});}
    catch (error) {if (error instanceof Error && "code" in error && error.code === 11000) {sendError(response, 409, "CONFLICT", "Submission changed concurrently. Retry the same submission key."); return;} throw error;}
  });
  const summary = (value: {_id: unknown; reference: string; name: string; type: string; status: string; createdAt: Date}) => ({id: String(value._id), reference: value.reference, name: value.name, type: value.type, status: value.status, createdAt: value.createdAt.toISOString()});
  admin.get("/", async (request, response) => {const query = pageQuerySchema.safeParse(request.query); if (!query.success) {sendError(response, 400, "INVALID_REQUEST", "Check pagination"); return;} const values = await Enquiry.find(query.data.cursor ? {_id: {$lt: new Types.ObjectId(query.data.cursor)}} : {}).sort({_id: -1}).limit(query.data.limit + 1).lean(); const page = values.slice(0, query.data.limit); response.json({items: page.map(summary), nextCursor: values.length > query.data.limit ? String(page.at(-1)!._id) : null});});
  admin.get("/:id", async (request, response) => {const value = /^[0-9a-f]{24}$/.test(String(request.params.id)) ? await Enquiry.findById(request.params.id).lean() : null; if (!value) {sendError(response, 404, "NOT_FOUND", "Enquiry not found"); return;} const notes = await Note.find({enquiryId: value._id}).sort({createdAt: 1}).limit(100).lean(); const actors = await identity.models.User.find({_id: {$in: notes.map(note => note.actorId)}}).select("emailNormalized").lean(); response.json({...summary(value), version: value.version, email: value.email, phone: value.phone ?? "", description: value.description, modelName: value.modelName ?? null, modelId: value.modelId ? String(value.modelId) : null, projectDate: value.projectDate ?? "", usage: value.usage ?? "", budget: value.budget ?? "", assignedTo: value.assignedTo ? String(value.assignedTo) : null, outcome: value.outcome ?? null, notes: notes.map(note => ({body: note.body, actor: actors.find(actor => String(actor._id) === String(note.actorId))?.emailNormalized ?? "Former staff", at: note.createdAt.toISOString()}))});});
  admin.post("/:id/update", sameOriginJson(config.origin), requireCsrf, express.json({limit: "4kb"}), async (request, response) => {
    const parsed = enquiryUpdateSchema.safeParse(request.body); if (!parsed.success || !authorize || !/^[0-9a-f]{24}$/.test(String(request.params.id))) {sendError(response, 400, "INVALID_REQUEST", "Choose status, outcome, assignment and current version"); return;}
    const actor = response.locals.identity as Identity;
    try {const changed = await connection.transaction(async session => {await authorize!(actor, session); const enquiry = await Enquiry.findById(request.params.id).session(session); if (!enquiry || enquiry.version !== parsed.data.version) return false; const input = parsed.data; if (input.assignedTo && !(await identity.models.User.exists({_id: input.assignedTo, roles: "admin", status: "active", staffStatus: {$ne: "deactivated"}}).session(session))) return false;
      enquiry.status = input.status; enquiry.outcome = input.status === "closed" ? input.outcome ?? undefined : undefined; enquiry.assignedTo = input.assignedTo ? new Types.ObjectId(input.assignedTo) : undefined; enquiry.version++; await enquiry.save({session}); if (input.note) await Note.create([{enquiryId: enquiry._id, actorId: actor.userId, body: input.note}], {session}); await Audit.create([{actorId: actor.userId, action: "enquiry.updated", entityId: enquiry._id}], {session}); return true;}); if (!changed) {sendError(response, 409, "CONFLICT", "Enquiry changed or the assignee is unavailable. Refresh."); return;} response.json({message: "Enquiry workflow updated"});} catch {sendError(response, 409, "CONFLICT", "Enquiry update could not be committed");}
  }); return {publicRouter, admin};
}
