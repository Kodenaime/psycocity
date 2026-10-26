import express from "express";
import type { ClientSession } from "mongoose";
import { paymentReviewQuerySchema, refundRecordSchema } from "@psycocity/validation";
import type { Identity, IdentityService } from "../identity/service.js";
import type { AuthConfig } from "../identity/config.js";
import type { MailRuntime } from "../identity/auth-service.js";
import { sameOriginJson, requireCsrf } from "../identity/security.js";
import { createAdminModels } from "../admin/models.js";
import { createRateLimitModel, createRateLimiter } from "../identity/rate-limit.js";
import { AdminActionError } from "../admin/service.js";
import { createPaymentModel } from "./models.js";
import { createPaymentReader } from "./records.js";
import { createRefundService } from "./refunds.js";
import type { VerificationProvider } from "./verification-provider.js";
import { sendError } from "../http.js";
export function createAdminPaymentRouter(identity: IdentityService, config: AuthConfig, mail: MailRuntime, provider: VerificationProvider | null, authorize: (actor: Identity, session: ClientSession) => Promise<void>) {
  const router = express.Router(); const connection = identity.models.User.db; const reader = createPaymentReader(identity); const Payment = createPaymentModel(connection); const {Audit} = createAdminModels(connection); const refunds = createRefundService(identity, provider, mail, config.origin); const limit = createRateLimiter(createRateLimitModel(connection));
  router.get("/", async (request, response) => {const query = paymentReviewQuerySchema.safeParse(request.query); if (!query.success) {sendError(response, 400, "INVALID_REQUEST", "Check payment filters"); return;} response.json(await reader.list(query.data));});
  router.get("/:reference", async (request, response) => {const value = await reader.detail(String(request.params.reference)); if (!value) {sendError(response, 404, "NOT_FOUND", "Payment not found"); return;} response.json(value);});
  router.use(sameOriginJson(config.origin), requireCsrf, express.json({limit: "3kb"}));
  router.post("/:reference/reconcile", async (request, response) => {
    if (!provider) {sendError(response, 503, "UNAVAILABLE", "Provider verification is not configured"); return;}
    const actor = response.locals.identity as Identity;
    if (!(await limit("staff-payment-reconcile", actor.userId, 20))) {sendError(response, 429, "RATE_LIMITED", "Please wait before requesting more verification"); return;}
    try {
      const found = await connection.transaction(async session => {await authorize(actor, session); const payment = await Payment.findOne({reference: request.params.reference}).session(session); if (!payment) return false; if (String(payment.ownerId) === actor.userId) throw new AdminActionError("Another staff member must reconcile your payment"); payment.nextVerifyAt = new Date(); await payment.save({session}); await Audit.create([{actorId: actor.userId, action: "payment.reconciliation_requested", entityId: payment._id}], {session}); return true;});
      if (!found) {sendError(response, 404, "NOT_FOUND", "Payment not found"); return;} response.json({message: "Provider verification queued. Staff cannot manually mark payments successful."});
    } catch (error) {if (error instanceof AdminActionError) {sendError(response, 403, "FORBIDDEN", error.message); return;} throw error;}
  });
  router.post("/:reference/refunds", async (request, response) => {
    const parsed = refundRecordSchema.safeParse(request.body); if (!parsed.success) {sendError(response, 400, "INVALID_REQUEST", "Provide the provider refund ID and reconciliation note"); return;}
    const actor = response.locals.identity as Identity;
    if (!(await limit("staff-refund-reconcile", actor.userId, 10))) {sendError(response, 429, "RATE_LIMITED", "Please wait before requesting more verification"); return;}
    try {await refunds.record(String(request.params.reference), parsed.data.providerRefundId, actor, parsed.data.note, authorize); response.json({message: "Refund evidence verified with the provider. No refund was initiated by this action."});}
    catch {sendError(response, 409, "CONFLICT", "Refund could not be verified or matched. Refresh and check provider availability, reference and amount.");}
  });
  return router;
}
