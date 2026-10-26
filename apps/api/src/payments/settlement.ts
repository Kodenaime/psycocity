import { randomBytes } from "node:crypto";
import type { IdentityService } from "../identity/service.js";
import type { MailRuntime } from "../identity/auth-service.js";
import { createApplicationModels } from "../applications/models.js";
import { createOfferModel } from "../offers/models.js";
import { createPaymentModel, createFinancialModels } from "./models.js";
import type { VerificationProvider } from "./verification-provider.js";
export function createSettlementService(identity: IdentityService, provider: VerificationProvider | null, mail: MailRuntime, origin: string) {
  const connection = identity.models.User.db; const Payment = createPaymentModel(connection); const {Event, Receipt} = createFinancialModels(connection); const Offer = createOfferModel(connection); const {Application} = createApplicationModels(connection);
  async function receipt(reference: string) {
    if (!mail) return false;
    return connection.transaction(async session => {
      const payment = await Payment.findOne({reference, state: "successful", verifiedAt: {$ne: null}}).session(session);
      if (!payment || !payment.paidAt || payment.receiptIssuedAt) return false;
      const owner = await identity.models.User.findById(payment.ownerId).session(session).lean(); if (!owner) return false;
      const number = `PSYC-${payment.reference.slice(5).toUpperCase()}`;
      await Receipt.create([{paymentId: payment._id, ownerId: payment.ownerId, reference: payment.reference, number, amountKobo: payment.amountKobo, currency: payment.currency, paidAt: payment.paidAt, termsVersion: payment.termsVersion}], {session});
      await mail.enqueue({to: owner.emailNormalized, subject: "Your Psycocity test payment receipt", text: `TEST MODE — no live money collected.
Receipt: ${number}\nPayment reference: ${payment.reference}\nVerified amount: NGN ${(payment.amountKobo / 100).toFixed(2)}\nPayment date: ${payment.paidAt!.toISOString()}\n${payment.reviewReason ? "This payment requires agency reconciliation before membership activation." : "Membership activation is a separate step."}\nView your private payment record:\n${new URL(`/applicant/payment-return?reference=${payment.reference}`, origin).href}`}, `payment-receipt:${payment._id}`, session);
      payment.receiptIssuedAt = new Date(); await payment.save({session}); return true;
    });
  }
  async function runOnce(reference?: string) {
    if (!provider) return false;
    const now = new Date(); const token = randomBytes(24).toString("hex");
    const payment = await Payment.findOneAndUpdate({...(reference ? {reference} : {}), $or: [{state: {$in: ["initialized", "initialization_unknown"]}}, {state: "initializing", initializationExpiresAt: {$lte: now}}, {state: "successful", receiptIssuedAt: null}], nextVerifyAt: {$lte: now}, verificationLeaseUntil: {$lte: now}}, {$set: {verificationLeaseUntil: new Date(Date.now() + 30_000), verificationLeaseToken: token}, $inc: {verificationAttempts: 1}}, {sort: {nextVerifyAt: 1, _id: 1}, returnDocument: "after"});
    if (!payment) return false;
    let errorCode = "";
    try {
      if (payment.state !== "successful") {
        // Provider I/O deliberately happens outside MongoDB transactions.
        const verified = await provider.verify(payment.reference);
        await connection.transaction(async session => {
          const current = await Payment.findOne({_id: payment._id, verificationLeaseToken: token, verificationLeaseUntil: {$gt: new Date()}}).session(session);
          if (!current || current.state === "successful") return;
          const [owner, offer, application, events] = await Promise.all([identity.models.User.findById(current.ownerId).session(session).lean(), Offer.findById(current.offerId).session(session), Application.findById(current.applicationId).session(session), Event.find({reference: current.reference}).session(session).lean()]);
          const matches = owner && verified.domain === "test" && verified.reference === current.reference && verified.amount === current.amountKobo && verified.currency === current.currency && verified.customer.email.toLowerCase() === owner.emailNormalized && verified.metadata.applicationId === String(current.applicationId) && verified.metadata.offerId === String(current.offerId);
          if (!matches || !offer || !application) {current.reviewReason = "verification_mismatch"; current.lastVerificationError = "verification_mismatch"; await current.save({session}); return;}
          if (verified.status !== "success" || !verified.paid_at) {current.lastVerificationError = "provider_pending"; await current.save({session}); return;}
          const duplicate = await Payment.exists({_id: {$ne: current._id}, applicationId: current.applicationId, state: "successful"}).session(session);
          const idConflict = await Payment.exists({_id: {$ne: current._id}, providerId: verified.id}).session(session);
          if (idConflict) {current.reviewReason = "verification_mismatch"; current.lastVerificationError = "provider_id_conflict"; await current.save({session}); return;}
          const paidAt = new Date(verified.paid_at);
          current.reviewReason = duplicate || events.some(event => event.providerId !== verified.id) ? "duplicate_charge" : !offer.active || paidAt > offer.expiresAt || new Date() > offer.expiresAt ? "late_settlement" : application.status !== "accepted" || application.consentHold ? "eligibility_changed" : "";
          current.state = "successful"; current.verifiedAt = new Date(); current.providerId = verified.id; current.paidAt = paidAt; current.lastVerificationError = "";
          await current.save({session});
          offer.status = "paid"; await offer.save({session});
          // Fence concurrent renewal/consent changes without assigning any role.
          await Application.updateOne({_id: application._id}, {$inc: {eligibilityRevision: 1}}, {session});
        });
      }
      // Receipt failure cannot roll back truth about a verified charge.
      await receipt(payment.reference);
    } catch {errorCode = "verification_or_receipt_unavailable";}
    finally {
      await Payment.updateOne({_id: payment._id, verificationLeaseToken: token}, {$set: {verificationLeaseUntil: new Date(0), verificationLeaseToken: "", nextVerifyAt: new Date(Date.now() + Math.min(60 * 60_000, 5000 * 2 ** Math.min(payment.verificationAttempts, 9))), ...(errorCode ? {lastVerificationError: errorCode} : {})}});
    }
    return true;
  }
  return {runOnce, receipt};
}
