import { createEventRouters } from "./events/router.js";
import express from "express";
import { createAdminRouters } from "./admin/router.js";
import { createGuardianRouters } from "./guardian/router.js";
import { createMediaRouter } from "./media/router.js";
import type { PrivateStorage } from "./media/storage.js";
import { createApplicationRouter } from "./applications/router.js";
import { emptyQuerySchema, healthSchema } from "@psycocity/validation";
import { createAuthRouter } from "./identity/router.js";
import type { AuthConfig } from "./identity/config.js";
import type { MailRuntime } from "./identity/auth-service.js";
import { requireIdentity } from "./identity/middleware.js";
import type { IdentityService, Identity } from "./identity/service.js";
import { requestContext, sendError } from "./http.js";

// Construction has no listener or process side effects, so tests use the real app.
export function createApp({ isDatabaseReady = async () => false, identityService, mail, authConfig, storage, adminKey }: { isDatabaseReady?: () => Promise<boolean>; identityService?: IdentityService; mail?: MailRuntime; authConfig?: AuthConfig; storage?: PrivateStorage | null; adminKey?: Buffer | null } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestContext);
  app.use((_request, response, next) => {
    response.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" });
    next();
  });
  app.get("/api/v1/health", (request, response) => {
    if (!emptyQuerySchema.safeParse(request.query).success) {
      sendError(response, 400, "INVALID_REQUEST", "Health endpoint does not accept query parameters");
      return;
    }
    response.json(healthSchema.parse({ status: "ok", service: "psycocity-api" }));
  });
  app.get("/api/v1/ready", async (_request, response) => {
    response.set("Cache-Control", "no-store");
    try {
      const ready = await isDatabaseReady();
      response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
    } catch {
      response.status(503).json({ status: "not_ready" });
    }
  });
  if (identityService) {
    app.get("/api/v1/auth/me", requireIdentity(identityService, { allowMfaPending: true }), (_request, response) => {
      const identity = response.locals.identity as Identity;
      response.set("Cache-Control", "no-store").json({ user: { id: identity.userId, email: identity.email, roles: identity.roles, verified: identity.verified, ...(identity.roles.includes("admin") ? { mfaRequired: !identity.mfaVerified, mfaEnabled: identity.mfaEnabled } : {}) } });
    });
  }
  if (identityService && authConfig) app.use("/api/v1/auth", createAuthRouter(identityService, mail ?? null, authConfig));
  if (identityService && authConfig) {
    const guardian = createGuardianRouters(identityService, authConfig, mail ?? null);
    app.use("/api/v1/applications/:applicationId/guardian", guardian.owner);
    app.use("/api/v1/guardian", guardian.publicRouter);
  }
  if (identityService && authConfig) app.use("/api/v1/applications", createApplicationRouter(identityService, authConfig, mail ?? null));
  if (identityService && authConfig) app.use("/api/v1/invitations", createEventRouters(identityService, authConfig, mail ?? null).owner);
  if (identityService && authConfig) app.use("/api/v1/media", createMediaRouter(identityService, authConfig, storage ?? null));
  if (identityService && authConfig) {
    const staff = createAdminRouters(identityService, mail ?? null, authConfig, adminKey ?? null);
    app.use("/api/v1/admin", staff.admin); app.use("/api/v1/staff", staff.activation);
  }
  // Unknown API requests must never fall through to the web document.
  app.use("/api", (_request, response) => {
    sendError(response, 404, "NOT_FOUND", "API route not found");
  });
  return app;
}
