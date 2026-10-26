import { createAdminPaymentRouter } from "../payments/admin.js";
import type { VerificationProvider } from "../payments/verification-provider.js";
import { createOfferRouters } from "../offers/router.js";
import { createEventRouters } from "../events/router.js";
import express from "express";
import { createReviewRouter } from "./review.js";
import { Types } from "mongoose";
import { mfaCodeSchema, pageQuerySchema, staffActivationSchema, staffInviteSchema } from "@psycocity/validation";
import type { Identity, IdentityService } from "../identity/service.js";
import type { AuthConfig } from "../identity/config.js";
import type { MailRuntime } from "../identity/auth-service.js";
import { requireIdentity } from "../identity/middleware.js";
import { requireCsrf, sameOriginJson } from "../identity/security.js";
import { createRateLimiter, createRateLimitModel } from "../identity/rate-limit.js";
import { setSessionCookies } from "../identity/cookies.js";
import { sendError } from "../http.js";
import { createApplicationModels } from "../applications/models.js";
import { createAdminModels } from "./models.js";
import { AdminActionError, createAdminService } from "./service.js";

export function createAdminRouters(identity: IdentityService, mail: MailRuntime, config: AuthConfig, key: Buffer | null, verificationProvider: VerificationProvider | null = null) {
  const models = createAdminModels(identity.models.User.db);
  const service = key ? createAdminService(identity, mail, key, config.origin) : null;
  const limit = createRateLimiter(createRateLimitModel(identity.models.User.db));
  const admin = express.Router(); const activation = express.Router();
  activation.post("/activate", sameOriginJson(config.origin), express.json({ limit: "8kb" }), async (request, response) => {
    if (!service) { sendError(response, 503, "UNAVAILABLE", "Staff security is not configured"); return; }
    if (!(await limit("staff-activation", request.ip ?? "unknown", 10))) { sendError(response, 429, "RATE_LIMITED", "Please wait before trying again"); return; }
    const input = staffActivationSchema.safeParse(request.body);
    if (!input.success) { sendError(response, 400, "INVALID_REQUEST", "Check the invitation and password"); return; }
    try {
      const session = await service.activate(input.data.token, input.data.password);
      if (!session) { sendError(response, 400, "INVALID_REQUEST", "The invitation or account credentials could not be verified"); return; }
      setSessionCookies(response, session, config.production);
      response.set("Cache-Control", "no-store").json({ message: "Staff invitation accepted. Complete authenticator verification." });
    } catch (error) {
      if (error instanceof AdminActionError) { sendError(response, error.code === "MFA_REQUIRED" ? 403 : 409, error.code, error.message); return; }
      throw error;
    }
  });
  admin.use(requireIdentity(identity, { allowMfaPending: true }), (_request, response, next) => {
    const actor = response.locals.identity as Identity;
    response.set("Cache-Control", "no-store");
    if (!actor.roles.includes("admin")) { sendError(response, 403, "FORBIDDEN", "Staff access is required"); return; }
    if (!service) { sendError(response, 503, "UNAVAILABLE", "Staff security is not configured"); return; }
    next();
  });
  admin.get("/mfa/info", (_request, response) => { const actor = response.locals.identity as Identity; response.json({ email: actor.email, enabled: actor.mfaEnabled }); });
  admin.post("/mfa/enrollment", sameOriginJson(config.origin), requireCsrf, express.json({ limit: "1kb" }), async (_request, response) => {
    const actor = response.locals.identity as Identity;
    if (!(await limit("mfa-enrollment", actor.userId, 5))) { sendError(response, 429, "RATE_LIMITED", "Please wait before trying again"); return; }
    const result = await service!.enroll(actor);
    if (!result) { sendError(response, 409, "CONFLICT", "Authenticator setup is already enabled or unavailable"); return; }
    response.json(result);
  });
  admin.post("/mfa/verify", sameOriginJson(config.origin), requireCsrf, express.json({ limit: "2kb" }), async (request, response) => {
    const actor = response.locals.identity as Identity;
    if (!(await limit("mfa-verification", actor.userId, 10))) { sendError(response, 429, "RATE_LIMITED", "Please wait before trying again"); return; }
    const input = mfaCodeSchema.safeParse(request.body);
    if (!input.success) { sendError(response, 400, "INVALID_REQUEST", "Enter your authenticator or recovery code"); return; }
    const result = await service!.verifyMfa(actor, input.data.method, input.data.code);
    if (!result) { sendError(response, 400, "INVALID_REQUEST", "The security code is invalid, expired or already used. Use a fresh code."); return; }
    setSessionCookies(response, result.session, config.production);
    response.json({ message: "Staff security verified", ...(result.recoveryCodes ? { recoveryCodes: result.recoveryCodes } : {}) });
  });
  admin.use((_request, response, next) => {
    if (!(response.locals.identity as Identity).mfaVerified) { sendError(response, 403, "MFA_REQUIRED", "Complete staff security verification"); return; }
    next();
  });
  admin.use("/payments", createAdminPaymentRouter(identity, config, mail, verificationProvider, (actor, session) => service!.authorize(actor, session, false)));
  admin.use("/events", createEventRouters(identity, config, mail, (actor, session) => service!.authorize(actor, session, false)).admin);
  admin.use("/applications", createOfferRouters(identity, config, mail, (actor, session) => service!.authorize(actor, session, false)).admin);
  admin.use("/applications", createReviewRouter(identity, mail, config, (actor, session) => service!.authorize(actor, session, false)));
  admin.get("/overview", async (_request, response) => {
    const [activeStaff, pendingInvitations, awaitingApplications, securedStaff] = await Promise.all([
      identity.models.User.countDocuments({ roles: "admin", status: "active", staffStatus: { $ne: "deactivated" } }),
      models.Invite.countDocuments({ status: "pending", expiresAt: { $gt: new Date() } }),
      createApplicationModels(identity.models.User.db).Application.countDocuments({ status: { $in: ["submitted", "under_review", "corrections_requested", "shortlisted", "assessment_scheduled", "assessed"] } }),
      identity.models.User.countDocuments({ roles: "admin", status: "active", staffStatus: { $ne: "deactivated" }, mfaEnabledAt: { $ne: null } }),
    ]);
    const actor = response.locals.identity as Identity;
    response.json({ userId: actor.userId, email: actor.email, activeStaff, pendingInvitations, awaitingApplications, securedStaff });
  });
  admin.get("/staff", async (request, response) => {
    const query = pageQuerySchema.safeParse(request.query);
    if (!query.success) { sendError(response, 400, "INVALID_REQUEST", "Check pagination parameters"); return; }
    const rows = await identity.models.User.find({ roles: "admin", ...(query.data.cursor ? { _id: { $lt: new Types.ObjectId(query.data.cursor) } } : {}) }).sort({ _id: -1 }).limit(query.data.limit + 1).select("emailNormalized status staffStatus mfaEnabledAt").lean();
    const page = rows.slice(0, query.data.limit);
    response.json({ items: page.map(value => ({ id: String(value._id), email: value.emailNormalized, active: value.status === "active" && value.staffStatus !== "deactivated", mfaEnabled: Boolean(value.mfaEnabledAt) })), nextCursor: rows.length > query.data.limit ? String(page.at(-1)!._id) : null });
  });
  admin.get("/invitations", async (request, response) => {
    const query = pageQuerySchema.safeParse(request.query);
    if (!query.success) { sendError(response, 400, "INVALID_REQUEST", "Check pagination parameters"); return; }
    const rows = await models.Invite.find(query.data.cursor ? { _id: { $lt: new Types.ObjectId(query.data.cursor) } } : {}).sort({ _id: -1 }).limit(query.data.limit + 1).lean(); const page = rows.slice(0, query.data.limit);
    response.json({ items: page.map(value => ({ id: String(value._id), email: value.email, status: value.status === "pending" && value.expiresAt <= new Date() ? "expired" : value.status, expiresAt: value.expiresAt.toISOString() })), nextCursor: rows.length > query.data.limit ? String(page.at(-1)!._id) : null });
  });
  admin.get("/audit", async (request, response) => {
    const query = pageQuerySchema.safeParse(request.query);
    if (!query.success) { sendError(response, 400, "INVALID_REQUEST", "Check pagination parameters"); return; }
    const rows = await models.Audit.find(query.data.cursor ? { _id: { $lt: new Types.ObjectId(query.data.cursor) } } : {}).sort({ _id: -1 }).limit(query.data.limit + 1).lean(); const page = rows.slice(0, query.data.limit);
    const actors = await identity.models.User.find({ _id: { $in: page.filter(value => value.actorId).map(value => value.actorId!) } }).select("emailNormalized").lean();
    const labels = new Map(actors.map(value => [String(value._id), value.emailNormalized]));
    response.json({ items: page.map(value => ({ id: String(value._id), action: value.action, actorId: value.actorId ? String(value.actorId) : null, actorLabel: value.actorId ? labels.get(String(value.actorId)) ?? "Former staff" : "System", entityId: value.entityId ? String(value.entityId) : null, at: value.createdAt.toISOString() })), nextCursor: rows.length > query.data.limit ? String(page.at(-1)!._id) : null });
  });
  admin.use(sameOriginJson(config.origin), requireCsrf, express.json({ limit: "4kb" }));
  function action(handler: express.RequestHandler): express.RequestHandler {
    return async (request, response, next) => {
      try { await handler(request, response, next); }
      catch (error) { if (error instanceof AdminActionError) { sendError(response, error.code === "MFA_REQUIRED" ? 403 : 409, error.code, error.message); return; } throw error; }
    };
  }
  admin.post("/invitations", action(async (request, response) => {
    const input = staffInviteSchema.safeParse(request.body);
    if (!input.success) { sendError(response, 400, "INVALID_REQUEST", "Enter a valid staff email"); return; }
    await service!.inviteStaff(response.locals.identity as Identity, input.data.email); response.status(202).json({ message: "Private staff invitation queued" });
  }));
  admin.post("/invitations/:id/revoke", action(async (request, response) => {
    if (!/^[0-9a-f]{24}$/.test(String(request.params.id))) { sendError(response, 400, "INVALID_REQUEST", "Invalid invitation reference"); return; }
    await service!.revokeInvite(response.locals.identity as Identity, String(request.params.id)); response.json({ message: "Invitation revoked" });
  }));
  admin.post("/staff/:id/deactivate", action(async (request, response) => {
    if (!/^[0-9a-f]{24}$/.test(String(request.params.id))) { sendError(response, 400, "INVALID_REQUEST", "Invalid staff reference"); return; }
    await service!.deactivate(response.locals.identity as Identity, String(request.params.id)); response.json({ message: "Staff access deactivated" });
  }));
  return { admin, activation };
}
