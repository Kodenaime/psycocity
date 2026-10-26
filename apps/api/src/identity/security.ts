import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { sendError } from "../http.js";
import { hashToken, type Identity } from "./service.js";
export function sameOriginJson(origin: string): RequestHandler {
  return (request, response, next) => {
    if (request.get("Origin") !== origin || request.get("X-Requested-With") !== "Psycocity" || !request.is("application/json")) {
      sendError(response, 403, "FORBIDDEN", "This request could not be verified"); return;
    }
    next();
  };
}
export const requireCsrf: RequestHandler = (request, response, next) => {
  const actor = response.locals.identity as Identity;
  const token = request.get("X-CSRF-Token");
  const actual = token ? Buffer.from(hashToken(token), "hex") : Buffer.alloc(0);
  const expected = Buffer.from(actor.csrfTokenHash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { sendError(response, 403, "FORBIDDEN", "This request could not be verified"); return; }
  next();
};
export const requireVerified: RequestHandler = (_request, response, next) => {
  if (!(response.locals.identity as Identity).verified) { sendError(response, 403, "FORBIDDEN", "Verify your email before applying"); return; }
  next();
};
