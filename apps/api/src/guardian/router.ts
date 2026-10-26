import express from "express";
import { guardianDecisionSchema, guardianPolicyVersion, guardianPreviewRequestSchema, guardianRequestSchema, tokenSchema } from "@psycocity/validation";
import { requireIdentity, requireRoles } from "../identity/middleware.js";
import { requireCsrf, requireVerified, sameOriginJson } from "../identity/security.js";
import { hashToken, newToken, type Identity, type IdentityService } from "../identity/service.js";
import { createRateLimiter, createRateLimitModel } from "../identity/rate-limit.js";
import type { AuthConfig } from "../identity/config.js";
import type { MailRuntime } from "../identity/auth-service.js";
import { createApplicationModels } from "../applications/models.js";
import { sendError } from "../http.js";
import { createGuardianModel } from "./models.js";
import { guardianStatus, subjectDetails } from "./service.js";

export function createGuardianRouters(identity: IdentityService, config: AuthConfig, mail: MailRuntime) {
  const connection = identity.models.User.db;
  const model = createGuardianModel(connection);
  const { Application } = createApplicationModels(connection);
  const limit = createRateLimiter(createRateLimitModel(connection));
  const owner = express.Router({ mergeParams: true });
  owner.use(requireIdentity(identity), requireRoles("applicant"), requireVerified);
  owner.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  owner.get("/", async (request, response) => {
    const id = String((request.params as Record<string, string>).applicationId);
    const actor = response.locals.identity as Identity;
    const application = /^[0-9a-f]{24}$/.test(id) ? await Application.findOne({ _id: id, ownerId: actor.userId }).lean() : null;
    if (!application) { sendError(response, 404, "NOT_FOUND", "Application not found"); return; }
    response.json(await guardianStatus(application, connection));
  });
  owner.post("/request", sameOriginJson(config.origin), requireCsrf, express.json({ limit: "4kb" }), async (request, response) => {
    const actor = response.locals.identity as Identity;
    const input = guardianRequestSchema.safeParse(request.body);
    const id = String((request.params as Record<string, string>).applicationId);
    if (!input.success || !/^[0-9a-f]{24}$/.test(id) || input.data.email === actor.email) { sendError(response, 400, "INVALID_REQUEST", "Provide a guardian name, separate email and relationship"); return; }
    if (!mail || !config.registrationEnabled) { sendError(response, 503, "UNAVAILABLE", "Guardian email requests are not available yet"); return; }
    if (!(await limit("guardian-request", `${actor.userId}:${id}`, 3, 60 * 60_000))) { sendError(response, 429, "RATE_LIMITED", "Please wait before requesting another guardian email"); return; }
    const token = newToken();
    const completed = await connection.transaction(async session => {
      const application = await Application.findOne({ _id: id, ownerId: actor.userId, status: { $in: ["draft", "corrections_requested"] } }).session(session).lean();
      if (!application) return false;
      if (application.status === "corrections_requested" && !application.correctionFields?.some(field => ["guardian", "personal.legalName", "personal.birthDate"].includes(field))) return "scope";
      const subject = subjectDetails(application);
      if (!subject.required || subject.name.length < 2) return false;
      await Application.updateOne({ _id: application._id }, { $inc: { eligibilityRevision: 1 } }, { session });
      await model.updateMany({ applicationId: application._id, status: { $in: ["pending", "consented"] } }, { $set: { status: "superseded" } }, { session });
      const [record] = await model.create([{ applicationId: application._id, ownerId: actor.userId, guardianName: input.data.guardianName, guardianEmail: input.data.email, relationship: input.data.relationship, policyVersion: guardianPolicyVersion, subjectHash: subject.hash, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) }], { session });
      const url = new URL("/guardian/consent", config.origin); url.searchParams.set("token", token);
      await mail.enqueue({ to: input.data.email, subject: "Guardian consent for Psycocity academy", text: `${subject.name} has named you as their parent or legal guardian for an academy application. Review the purpose and make your own decision using this private, single-use link:
${url.href}

You must be at least 18 and authorized to act as their parent or legal guardian. The link expires in 24 hours. If this request is unexpected, do not consent.` }, `guardian-request:${record!._id}`, session);
      return true;
    });
    if (completed === "scope") { sendError(response, 403, "FORBIDDEN", "Guardian details are outside the requested corrections"); return; }
    if (!completed) { sendError(response, 400, "INVALID_REQUEST", "Save the eligible academy applicant’s name and birth date before requesting consent"); return; }
    response.status(202).json({ message: "A private consent request has been queued for your guardian" });
  });
  const publicRouter = express.Router();
  publicRouter.use(sameOriginJson(config.origin), express.json({ limit: "8kb" }), async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!(await limit("guardian-public", request.ip ?? "unknown", 30))) { sendError(response, 429, "RATE_LIMITED", "Please wait before trying again"); return; }
    next();
  });
  publicRouter.post("/preview", async (request, response) => {
    const input = guardianPreviewRequestSchema.safeParse(request.body);
    if (!input.success) { sendError(response, 400, "INVALID_REQUEST", "This private link is invalid or expired"); return; }
    const record = await model.findOne(input.data.purpose === "consent" ? { tokenHash: hashToken(input.data.token), status: "pending", expiresAt: { $gt: new Date() } } : { withdrawalHash: hashToken(input.data.token), status: "consented", withdrawalExpiresAt: { $gt: new Date() } }).lean();
    if (!record) { sendError(response, 400, "INVALID_REQUEST", "This private link is invalid or expired"); return; }
    const application = await Application.findById(record.applicationId).lean();
    if (!application || subjectDetails(application).hash !== record.subjectHash) { sendError(response, 400, "INVALID_REQUEST", "Applicant details changed. A new consent request is needed."); return; }
    response.json({ applicantName: subjectDetails(application).name, guardianName: record.guardianName, relationship: record.relationship, policyVersion: record.policyVersion });
  });
  publicRouter.post("/consent", async (request, response) => {
    const input = guardianDecisionSchema.safeParse(request.body);
    if (!input.success) { sendError(response, 400, "INVALID_REQUEST", "Confirm your name, adult/guardian declarations and current consent terms"); return; }
    if (!mail || !config.registrationEnabled) { sendError(response, 503, "UNAVAILABLE", "Guardian decisions are unavailable"); return; }
    const withdrawalToken = newToken();
    const completed = await connection.transaction(async session => {
      const record = await model.findOne({ tokenHash: hashToken(input.data.token), status: "pending", expiresAt: { $gt: new Date() }, policyVersion: guardianPolicyVersion }).session(session);
      if (!record) return false;
      const application = await Application.findOne({ _id: record.applicationId, status: { $in: ["draft", "corrections_requested"] } }).session(session).lean();
      if (!application || subjectDetails(application).hash !== record.subjectHash || !subjectDetails(application).required) return false;
      await Application.updateOne({ _id: application._id }, { $inc: { eligibilityRevision: 1 }, $set: { consentHold: false } }, { session });
      await model.updateOne({ _id: record._id, status: "pending" }, { $set: { status: "consented", verifiedAt: new Date(), consentedAt: new Date(), guardianName: input.data.guardianName, relationship: input.data.relationship, declaration: "adult-authorized-guardian-and-admissions-processing-consent", withdrawalHash: hashToken(withdrawalToken), withdrawalExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000) } }, { session });
      const url = new URL("/guardian/withdraw", config.origin); url.searchParams.set("token", withdrawalToken);
      await mail.enqueue({ to: record.guardianEmail, subject: "Your Psycocity guardian consent record", text: `Your email and explicit guardian consent for ${subjectDetails(application).name}'s application were recorded under ${guardianPolicyVersion}. This verifies email ownership and your declaration, not independent proof of legal guardianship.

To withdraw this application-processing consent within 30 days, use your separate private link:
${url.href}

Withdrawal pauses further assessment for agency review. For later withdrawal or safeguarding questions, contact the agency through its published safeguarding channel.` }, `guardian-confirmed:${record._id}`, session);
      return true;
    });
    if (!completed) { sendError(response, 400, "INVALID_REQUEST", "This consent link is expired, already used or the applicant details changed"); return; }
    response.json({ message: "Guardian consent recorded. A private confirmation and withdrawal link will be emailed to you." });
  });
  for (const action of ["decline", "withdraw"] as const) publicRouter.post(`/${action}`, async (request, response) => {
    const input = tokenSchema.safeParse(request.body);
    if (!input.success || !config.registrationEnabled) { sendError(response, 400, "INVALID_REQUEST", "This private link is invalid or unavailable"); return; }
    const completed = await connection.transaction(async session => {
      const record = await model.findOneAndUpdate(action === "decline" ? { tokenHash: hashToken(input.data.token), status: "pending", expiresAt: { $gt: new Date() } } : { withdrawalHash: hashToken(input.data.token), status: "consented", withdrawalExpiresAt: { $gt: new Date() } }, { $set: { status: action === "decline" ? "declined" : "withdrawn", withdrawnAt: new Date() } }, { session, returnDocument: "after" });
      if (!record) return false;
      await Application.updateOne({ _id: record.applicationId }, { $set: { consentHold: true }, $inc: { eligibilityRevision: 1, version: 1 } }, { session });
      return true;
    });
    if (!completed) { sendError(response, 400, "INVALID_REQUEST", "This private link is expired or already used"); return; }
    response.json({ message: action === "decline" ? "Consent declined. Further processing is paused." : "Consent withdrawn. Further processing is paused for agency review." });
  });
  return { owner, publicRouter };
}
