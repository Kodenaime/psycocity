import { createApplicationExports } from "./applications/export.js";
import { createContentRouters } from "./content/router.js";
import { createAssignmentRouters } from "./academy/assignments.js";
import { createProgressRouters } from "./academy/progress.js";
import { createLearningRouters } from "./academy/learning.js";
import { createTimetableRouters } from "./academy/timetable.js";
import { createAcademyRouters } from "./academy/router.js";
import { createEnquiryRouters } from "./enquiries/router.js";
import { createCatalogueRouter } from "./members/catalogue.js";
import { createPortfolioRouter } from "./members/portfolio.js";
import { createProfileRouter } from "./members/profiles.js";
import { createMemberRouters } from "./members/router.js";
import { createPaymentWebhook } from "./payments/webhook.js";
import type { VerificationProvider } from "./payments/verification-provider.js";
import { createPaymentRouter } from "./payments/router.js";
import type { CheckoutProvider } from "./payments/provider.js";
import { createOfferRouters } from "./offers/router.js";
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
export function createApp({ isDatabaseReady = async () => false, identityService, mail, authConfig, storage, adminKey, checkoutProvider, verificationProvider, trustProxy = false }: { isDatabaseReady?: () => Promise<boolean>; identityService?: IdentityService; mail?: MailRuntime; authConfig?: AuthConfig; storage?: PrivateStorage | null; adminKey?: Buffer | null; checkoutProvider?: CheckoutProvider | null; verificationProvider?: VerificationProvider | null; trustProxy?: false | string[] } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy",trustProxy);
  app.use(requestContext);
  if(authConfig?.production)app.use((_request,response,next)=>{response.set("Strict-Transport-Security","max-age=31536000");next();});
  app.use((_request, response, next) => {
    response.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "Permissions-Policy":"camera=(), microphone=(), geolocation=()", "Content-Security-Policy":"frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" });
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
  if (identityService && authConfig) app.use("/api/v1/applications/:applicationId/offers", createOfferRouters(identityService, authConfig, mail ?? null).owner);
  if (identityService) app.use("/api/v1/applications",createApplicationExports(identityService,storage??null));
  if (identityService && authConfig) app.use("/api/v1/applications", createApplicationRouter(identityService, authConfig, mail ?? null));
  if (identityService && authConfig) app.use("/api/v1/castings", createEventRouters(identityService, authConfig, mail ?? null, undefined, true).owner);
  if (identityService && authConfig) app.use("/api/v1/invitations", createEventRouters(identityService, authConfig, mail ?? null).owner);
  if (identityService && authConfig) app.use("/api/v1/media", createMediaRouter(identityService, authConfig, storage ?? null));
  if (identityService && authConfig) {
    const staff = createAdminRouters(identityService, mail ?? null, authConfig, adminKey ?? null, verificationProvider ?? null);
    app.use("/api/v1/admin", staff.admin); app.use("/api/v1/staff", staff.activation);
  }
  if (identityService) app.use("/api/v1/paystack/webhook", createPaymentWebhook(identityService, verificationProvider ?? null));
  if (identityService && authConfig) {const membership = createMemberRouters(identityService, authConfig, mail ?? null); app.use("/api/v1/member", membership.member); app.use("/api/v1/membership-invitations", membership.invitations);}
  if (identityService && authConfig) app.use("/api/v1/member/portfolio", createPortfolioRouter(identityService, authConfig, storage ?? null));
  if (identityService && authConfig) app.use("/api/v1/member", createProfileRouter(identityService, authConfig));
  if (identityService && authConfig) app.use("/api/v1/payments", createPaymentRouter(identityService, authConfig, checkoutProvider ?? null));
  if (identityService) app.use("/api/v1/models", createCatalogueRouter(identityService, storage ?? null));
  if (identityService && authConfig) app.use("/api/v1/enquiries", createEnquiryRouters(identityService, authConfig).publicRouter);
  if (identityService && authConfig) app.use("/api/v1/academy", createAssignmentRouters(identityService, authConfig).student);
  if (identityService && authConfig) app.use("/api/v1/academy", createProgressRouters(identityService, authConfig).student);
  if (identityService && authConfig) app.use("/api/v1/academy", createLearningRouters(identityService, authConfig).student);
  if (identityService && authConfig) app.use("/api/v1/academy", createTimetableRouters(identityService, authConfig).student);
  if (identityService && authConfig) app.use("/api/v1/academy", createAcademyRouters(identityService, authConfig).student);
  if (identityService && authConfig) app.use("/api/v1/content", createContentRouters(identityService,authConfig).publicRouter);
  // Unknown API requests must never fall through to the web document.
  app.use("/api", (_request, response) => {
    sendError(response, 404, "NOT_FOUND", "API route not found");
  });
  return app;
}
