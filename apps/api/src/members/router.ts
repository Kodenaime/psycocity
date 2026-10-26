import { AdminActionError } from "../admin/service.js";
import express from "express";
import type { ClientSession } from "mongoose";
import { memberActivationSchema } from "@psycocity/validation";
import type { Identity, IdentityService } from "../identity/service.js";
import type { MailRuntime } from "../identity/auth-service.js";
import type { AuthConfig } from "../identity/config.js";
import { requireIdentity, requireRoles } from "../identity/middleware.js";
import { sameOriginJson, requireCsrf, requireVerified } from "../identity/security.js";
import { createRateLimiter, createRateLimitModel } from "../identity/rate-limit.js";
import { setSessionCookies } from "../identity/cookies.js";
import { sendError } from "../http.js";
import { createMembershipService } from "./service.js";
export function createMemberRouters(identity: IdentityService, config: AuthConfig, mail: MailRuntime, authorize?: (actor: Identity, session: ClientSession) => Promise<void>) {
  const service = createMembershipService(identity, mail, config.origin); const limit = createRateLimiter(createRateLimitModel(identity.models.User.db));
  const member = express.Router(); const invitations = express.Router(); const admin = express.Router();
  member.post("/activate", sameOriginJson(config.origin), express.json({limit: "4kb"}), async (request, response) => {
    if (!(await limit("member-activate-ip", request.ip ?? "unknown", 20))) {sendError(response, 429, "RATE_LIMITED", "Please wait before retrying membership registration"); return;}
    const parsed = memberActivationSchema.safeParse(request.body); if (!parsed.success) {sendError(response, 400, "INVALID_REQUEST", "Provide your invitation key, verified applicant email, current password and optional valid username"); return;}
    if (!(await limit("member-activate-email", parsed.data.email, 8))) {sendError(response, 429, "RATE_LIMITED", "Please wait before retrying membership registration"); return;}
    try {
      const result = await service.activate(parsed.data); if (!result) {sendError(response, 400, "INVALID_REQUEST", "Invitation or account credentials could not be verified. Check expiry, email and eligibility."); return;}
      setSessionCookies(response, result.session, config.production); response.set("Cache-Control", "no-store").json({message: "Membership registration complete", type: result.type, mfaRequired: result.session.mfaRequired});
    } catch (error) {if (error instanceof Error && "code" in error && error.code === 11000) {sendError(response, 409, "CONFLICT", "The account or membership changed, or that username is unavailable. Refresh and try again."); return;} throw error;}
  });
  member.use(requireIdentity(identity), requireRoles("student", "model"), requireVerified, (_request, response, next) => {response.set("Cache-Control", "no-store"); next();});
  member.get("/me", async (_request, response) => {response.json(await service.access(response.locals.identity as Identity));});
  for (const type of ["student", "model"] as const) member.get(`/${type}`, requireRoles(type), async (_request, response) => {
    const access = await service.access(response.locals.identity as Identity); if (!access.memberships.some(value => value.type === type && value.accessible)) {sendError(response, 403, "FORBIDDEN", "Active paid membership and current eligibility are required"); return;} response.json(access);
  });
  invitations.use(requireIdentity(identity), requireRoles("applicant"), requireVerified, (_request, response, next) => {response.set("Cache-Control", "no-store"); next();});
  invitations.get("/", async (_request, response) => {response.json(await service.status((response.locals.identity as Identity).userId));});
  invitations.post("/:id/reissue", sameOriginJson(config.origin), requireCsrf, express.json({limit: "1kb"}), async (request, response) => {
    const actor = response.locals.identity as Identity; if (!(await limit("member-invite-reissue", actor.userId, 5))) {sendError(response, 429, "RATE_LIMITED", "Please wait before requesting another key"); return;}
    if (!/^[0-9a-f]{24}$/.test(String(request.params.id)) || !(await service.issue(String(request.params.id), actor))) {sendError(response, 409, "CONFLICT", "A replacement is unavailable. Wait one minute after an issue, check eligibility, or contact the agency. No additional payment is required."); return;} response.json({message: "A replacement key was queued for your verified email. Older keys are revoked; you do not pay again."});
  });
  admin.get("/applications/:id/membership", async (request, response) => {if (!/^[0-9a-f]{24}$/.test(String(request.params.id))) {sendError(response, 404, "NOT_FOUND", "Application not found"); return;} response.json(await service.status(undefined, String(request.params.id)));});
  admin.post("/memberships/:id/:action", sameOriginJson(config.origin), requireCsrf, express.json({limit: "1kb"}), async (request, response) => {
    if (!authorize || !/^[0-9a-f]{24}$/.test(String(request.params.id)) || !["reissue", "revoke"].includes(String(request.params.action))) {sendError(response, 400, "INVALID_REQUEST", "Choose a valid membership action"); return;}
    const actor = response.locals.identity as Identity;
    if (!(await limit("staff-member-invitations", actor.userId, 20))) {sendError(response, 429, "RATE_LIMITED", "Please wait before requesting more key changes"); return;}
    try {const result = request.params.action === "reissue" ? await service.issue(String(request.params.id), actor, authorize) : await service.revoke(String(request.params.id), actor, authorize);
    if (!result) {sendError(response, 409, "CONFLICT", "Membership changed, is ineligible, or was issued within the last minute. Staff cannot manage their own membership."); return;} response.json({message: request.params.action === "reissue" ? "Replacement invitation queued to the original verified email" : "Pending entitlement and invitation revoked; no additional charge was made"});
    } catch (error) {if (error instanceof AdminActionError) {sendError(response, 403, "FORBIDDEN", error.message); return;} throw error;}
  });
  return {member, invitations, admin};
}
