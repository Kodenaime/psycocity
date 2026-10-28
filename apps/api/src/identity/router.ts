import { readTrustedDevice } from "./trusted-device.js";
import express from "express";
import { parse } from "cookie";
import { timingSafeEqual } from "node:crypto";
import { emailRequestSchema, loginSchema, registerSchema, resetPasswordSchema, tokenSchema, type z } from "@psycocity/validation";
import { setSessionCookies, clearSessionCookies } from "./cookies.js";
import { sendError } from "../http.js";
import { createAuthService, type MailRuntime } from "./auth-service.js";
import { createRateLimitModel, createRateLimiter } from "./rate-limit.js";
import { requireIdentity } from "./middleware.js";
import { hashToken, sessionCookieName, type Identity, type IdentityService } from "./service.js";
import type { AuthConfig } from "./config.js";

export function createAuthRouter(identity: IdentityService, mail: MailRuntime, config: AuthConfig) {
  const router = express.Router();
  const auth = createAuthService(identity, mail, config.origin);
  const limit = createRateLimiter(createRateLimitModel(identity.models.User.db));
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.get("/capabilities", (_request, response) => response.json({ registrationAvailable: Boolean(mail) && config.registrationEnabled, testMode: !config.production }));
  router.use((request, response, next) => {
    if (request.method !== "POST" || request.get("Origin") !== config.origin || request.get("X-Requested-With") !== "Psycocity" || !request.is("application/json")) {
      sendError(response, 403, "FORBIDDEN", "This request could not be verified"); return;
    }
    next();
  });
  router.use(express.json({ limit: "16kb" }));
  function action<T>(scope: string, schema: z.ZodType<T>, handler: (input: T, request: express.Request, response: express.Response) => Promise<void>, count = 10): express.RequestHandler {
    return async (request, response) => {
      if (!(await limit(`${scope}:ip`, request.ip ?? "unknown", count))) { response.set("Retry-After", "900"); sendError(response, 429, "RATE_LIMITED", "Please wait before trying again"); return; }
      const input = schema.safeParse(request.body);
      if (!input.success) { sendError(response, 400, "INVALID_REQUEST", "Check the required fields and try again"); return; }
      await handler(input.data, request, response);
    };
  }
  function requireMail(response: express.Response) {
    if (!mail || !config.registrationEnabled) { sendError(response, 503, "UNAVAILABLE", "Account registration and email requests are not available yet"); return false; }
    return true;
  }
  const genericMessage = { message: "If your request is eligible, a private email will arrive shortly" };
  router.post("/register", action("register", registerSchema, async (input, _request, response) => {
    if (!requireMail(response)) return;
    await auth.register(input.email, input.password);
    response.status(202).json(genericMessage);
  }));
  for (const [path, purpose] of [["resend-verification", "email_verification"], ["forgot-password", "password_reset"]] as const) {
    router.post(`/${path}`, action(path, emailRequestSchema, async (input, _request, response) => {
      if (!requireMail(response)) return;
      if (await limit(`${path}:email`, input.email, 3, 60 * 60 * 1000)) await auth.requestToken(input.email, purpose);
      response.status(202).json(genericMessage);
    }));
  }
  router.post("/verify-email", action("verify-email", tokenSchema, async (input, _request, response) => {
    if (!(await auth.verifyEmail(input.token))) { sendError(response, 400, "INVALID_REQUEST", "This verification link is invalid or expired"); return; }
    response.json({ message: "Email verified. You can now sign in." });
  }, 30));
  router.post("/reset-password", action("reset-password", resetPasswordSchema, async (input, _request, response) => {
    if (!(await auth.resetPassword(input.token, input.password))) { sendError(response, 400, "INVALID_REQUEST", "This reset link is invalid or expired"); return; }
    response.json({ message: "Password updated. Please sign in again." });
  }));
  router.post("/login", action("login", loginSchema, async (input, request, response) => {
    if (!(await limit("login:identifier", input.identifier, 10))) { sendError(response, 429, "RATE_LIMITED", "Please wait before trying again"); return; }
    const session = await auth.login(input.identifier, input.password, readTrustedDevice(request.get("Cookie")));
    if (!session) { sendError(response, 401, "UNAUTHORIZED", "The sign-in details could not be verified"); return; }
    const old = await identity.authenticate(parse(request.headers.cookie ?? "")[sessionCookieName]);
    if (old) await identity.revokeOwnedSession(old.userId, old.sessionId);
    setSessionCookies(response, session, config.production);
    response.json({ message: "Signed in", mfaRequired: session.mfaRequired, setupRequired: session.setupRequired });
  }, 30));
  router.post("/logout", requireIdentity(identity, { allowMfaPending: true }), async (request, response) => {
    const actor = response.locals.identity as Identity;
    const submitted = request.get("X-CSRF-Token");
    const actual = submitted ? Buffer.from(hashToken(submitted), "hex") : Buffer.alloc(0);
    const expected = Buffer.from(actor.csrfTokenHash, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { sendError(response, 403, "FORBIDDEN", "This request could not be verified"); return; }
    await identity.revokeOwnedSession(actor.userId, actor.sessionId);
    clearSessionCookies(response, config.production);
    response.json({ message: "Signed out" });
  });
  return router;
}
