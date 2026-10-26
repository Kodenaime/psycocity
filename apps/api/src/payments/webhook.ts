import express from "express";
import { z } from "@psycocity/validation";
import type { IdentityService } from "../identity/service.js";
import { sendError } from "../http.js";
import { createFinancialModels, createPaymentModel } from "./models.js";
import type { VerificationProvider } from "./verification-provider.js";
const eventSchema = z.object({event: z.literal("charge.success"), data: z.object({reference: z.string().regex(/^psyc_[0-9a-f]{40}$/), id: z.union([z.number().int().positive().safe(), z.string().regex(/^[1-9][0-9]{0,30}$/)]).transform(String)})});
export function createPaymentWebhook(identity: IdentityService, provider: VerificationProvider | null) {
  const router = express.Router(); const connection = identity.models.User.db; const {Event} = createFinancialModels(connection); const Payment = createPaymentModel(connection);
  router.post("/", express.raw({type: "application/json", limit: "64kb"}), async (request, response) => {
    if (!provider) {sendError(response, 503, "UNAVAILABLE", "Payment verification is unavailable"); return;}
    if (!Buffer.isBuffer(request.body) || !provider.validSignature(request.body, request.get("x-paystack-signature") ?? "")) {sendError(response, 401, "UNAUTHORIZED", "Invalid webhook signature"); return;}
    let body: unknown; try {body = JSON.parse(request.body.toString("utf8"));} catch {sendError(response, 400, "INVALID_REQUEST", "Invalid event body"); return;}
    if (z.object({event: z.string()}).safeParse(body).data?.event !== "charge.success") {response.sendStatus(200); return;}
    const parsed = eventSchema.safeParse(body); if (!parsed.success) {sendError(response, 400, "INVALID_REQUEST", "Invalid payment event"); return;}
    const {reference, id} = parsed.data.data; const eventKey = `charge.success:${id}:${reference}`;
    try {
      await connection.transaction(async session => {
        await Event.updateOne({eventKey}, {$setOnInsert: {eventKey, reference, providerId: id, type: "charge.success"}}, {upsert: true, session});
        const payment = await Payment.findOne({reference}).session(session);
        if (payment) {
          if (payment.providerId && payment.providerId !== id) payment.reviewReason = "duplicate_charge";
          payment.nextVerifyAt = new Date(); await payment.save({session});
        }
      });
    } catch (error) {if (!(error instanceof Error && "code" in error && error.code === 11000)) throw error;}
    response.sendStatus(200);
  });
  return router;
}
