import type { RequestHandler } from "express";
import { parse } from "cookie";
import { sendError } from "../http.js";
import { sessionCookieName, type Identity, type IdentityService } from "./service.js";

export function requireIdentity(service: IdentityService, { allowMfaPending = false }: { allowMfaPending?: boolean } = {}): RequestHandler {
  return async (request, response, next) => {
    const token = parse(request.headers.cookie ?? "")[sessionCookieName];
    const identity = await service.authenticate(token);
    if (!identity) { sendError(response, 401, "UNAUTHORIZED", "Please sign in to continue"); return; }
    if (!allowMfaPending && !identity.mfaVerified) { sendError(response, 403, "MFA_REQUIRED", "Complete staff security verification"); return; }
    response.locals.identity = identity;
    next();
  };
}
export function requireRoles(...roles: string[]): RequestHandler {
  return (_request, response, next) => {
    const identity = response.locals.identity as Identity | undefined;
    if (identity && roles.includes("admin") && identity.roles.includes("admin") && !identity.mfaVerified) { sendError(response, 403, "MFA_REQUIRED", "Complete staff security verification"); return; }
    if (!identity || !roles.some(role => identity.roles.includes(role))) {
      sendError(response, 403, "FORBIDDEN", "You do not have access to this action"); return;
    }
    next();
  };
}
