import express from "express";
import { randomBytes } from "node:crypto";
import { checkoutRequestSchema } from "@psycocity/validation";
import type { Identity, IdentityService } from "../identity/service.js";
import type { AuthConfig } from "../identity/config.js";
import { requireIdentity, requireRoles } from "../identity/middleware.js";
import { sameOriginJson, requireCsrf, requireVerified } from "../identity/security.js";
import { createApplicationModels } from "../applications/models.js";
import { createOfferModel } from "../offers/models.js";
import { guardianStatus } from "../guardian/service.js";
import { createRateLimitModel, createRateLimiter } from "../identity/rate-limit.js";
import { sendError } from "../http.js";
import { createPaymentModel } from "./models.js";
import { safeCheckoutUrl, type CheckoutProvider } from "./provider.js";
export function createPaymentRouter(identity: IdentityService, config: AuthConfig, provider: CheckoutProvider | null) {
  const router = express.Router(); const connection = identity.models.User.db; const Payment = createPaymentModel(connection); const Offer = createOfferModel(connection); const {Application} = createApplicationModels(connection); const limit = createRateLimiter(createRateLimitModel(connection));
  router.use(requireIdentity(identity), requireRoles("applicant"), requireVerified, (_request, response, next) => {response.set("Cache-Control", "no-store"); next();});
  router.get("/capabilities", (_request, response) => {response.json({available: Boolean(provider) && !config.production, testMode: true});});
  type Payment = NonNullable<Awaited<ReturnType<typeof Payment.findOne>>>;
  const dto = (payment: Payment, allowCheckout: boolean) => ({reference: payment.reference, amountKobo: payment.amountKobo, currency: payment.currency, state: payment.state === "initializing" && payment.initializationExpiresAt <= new Date() ? "initialization_unknown" : payment.state, checkoutUrl: allowCheckout && payment.state === "initialized" ? payment.checkoutUrl ?? null : null, message: payment.state === "successful" ? "Payment verification recorded. Membership activation is separate." : "Payment is not confirmed. Returning from checkout does not activate membership. If initialization is uncertain, do not start a second payment; contact the agency."});
  router.get("/:reference", async (request, response) => {
    if (!/^psyc_[0-9a-f]{40}$/.test(String(request.params.reference))) {sendError(response, 404, "NOT_FOUND", "Payment not found"); return;}
    const payment = await Payment.findOne({reference: request.params.reference, ownerId: (response.locals.identity as Identity).userId}).select("+checkoutUrl"); if (!payment) {sendError(response, 404, "NOT_FOUND", "Payment not found"); return;}
    const offer = await Offer.findById(payment.offerId).lean(); const application = await Application.findById(payment.applicationId).lean();
    response.json(dto(payment, Boolean(provider && offer?.active && offer.expiresAt > new Date() && application?.status === "accepted" && !application.consentHold)));
  });
  router.post("/offers/:id/checkout", sameOriginJson(config.origin), requireCsrf, express.json({limit: "2kb"}), async (request, response) => {
    const parsed = checkoutRequestSchema.safeParse(request.body);
    if (!parsed.success || !/^[0-9a-f]{24}$/.test(String(request.params.id))) {sendError(response, 400, "INVALID_REQUEST", "Accept the current offer terms before checkout"); return;}
    if (!provider || config.production) {sendError(response, 503, "UNAVAILABLE", "Paystack test checkout is not configured"); return;}
    const actor = response.locals.identity as Identity;
    if (!(await limit("checkout-initialize", actor.userId, 10))) {sendError(response, 429, "RATE_LIMITED", "Please wait before retrying checkout"); return;}
    const result = await connection.transaction(async session => {
      const offer = await Offer.findOne({_id: request.params.id, ownerId: actor.userId, active: true, status: "issued", expiresAt: {$gt: new Date()}, termsVersion: parsed.data.termsVersion}).session(session);
      if (!offer) return null;
      const application = await Application.findOne({_id: offer.applicationId, ownerId: actor.userId, status: "accepted", consentHold: false}).session(session);
      if (!application || !(await guardianStatus(application, connection, session)).canUpload) return null;
      // Offer and application writes fence expiry/renewal/consent races.
      await Offer.updateOne({_id: offer._id}, {$set: {updatedAt: new Date()}}, {session});
      await Application.updateOne({_id: application._id}, {$inc: {eligibilityRevision: 1}}, {session});
      const existing = await Payment.findOne({offerId: offer._id, active: true}).select("+checkoutUrl").session(session); if (existing) return {payment: existing, fresh: false};
      const [payment] = await Payment.create([{offerId: offer._id, applicationId: application._id, ownerId: actor.userId, reference: `psyc_${randomBytes(20).toString("hex")}`, amountKobo: offer.amountKobo, currency: offer.currency, termsVersion: offer.termsVersion, termsAcceptedAt: new Date(), initializationExpiresAt: new Date(Date.now() + 30_000)}], {session});
      return {payment: payment!, fresh: true};
    });
    if (!result) {sendError(response, 409, "CONFLICT", "An accepted, unexpired offer with current terms and consent is required"); return;}
    if (result.fresh) {
      try {
        const callback = new URL("/applicant/payment-return", config.origin); callback.searchParams.set("reference", result.payment.reference);
        const url = safeCheckoutUrl(await provider.initialize({email: actor.email, amount: result.payment.amountKobo, reference: result.payment.reference, callbackUrl: callback.href, applicationId: String(result.payment.applicationId), offerId: String(result.payment.offerId)}));
        await Payment.updateOne({_id: result.payment._id, state: "initializing"}, {$set: {state: "initialized", checkoutUrl: url}});
      } catch {await Payment.updateOne({_id: result.payment._id, state: "initializing"}, {$set: {state: "initialization_unknown"}});}
    }
    const payment = (await Payment.findById(result.payment._id).select("+checkoutUrl"))!;
    const currentOffer = await Offer.findById(payment.offerId).lean();
    const currentApplication = await Application.findById(payment.applicationId).lean();
    response.status(result.fresh ? 201 : 200).json(dto(payment, Boolean(currentOffer?.active && currentOffer.expiresAt > new Date() && currentApplication?.status === "accepted" && !currentApplication.consentHold)));
  });
  return router;
}
