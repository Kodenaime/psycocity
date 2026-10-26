import { randomBytes } from "node:crypto";
import type { ClientSession } from "mongoose";
import type { Identity, IdentityService } from "../identity/service.js";
import type { MailRuntime } from "../identity/auth-service.js";
import { createAdminModels } from "../admin/models.js";
import { createPaymentModel, createRefundModel } from "./models.js";
import type { VerificationProvider, VerifiedRefund } from "./verification-provider.js";
export function createRefundService(identity: IdentityService, provider: VerificationProvider | null, mail: MailRuntime, origin: string) {
  const connection = identity.models.User.db; const Refund = createRefundModel(connection); const Payment = createPaymentModel(connection); const {Audit} = createAdminModels(connection);
  async function notify(id: string) {
    if (!mail) return false;
    return connection.transaction(async session => {
      const record = await Refund.findOne({providerRefundId: id, status: "processed", notificationIssuedAt: null}).session(session); if (!record) return false;
      const payment = await Payment.findById(record.paymentId).session(session).lean(); if (!payment) return false;
      const owner = await identity.models.User.findById(payment.ownerId).session(session).lean(); if (!owner) return false;
      await mail.enqueue({to: owner.emailNormalized, subject: "Your Psycocity refund update", text: `The provider has confirmed a refund of NGN ${(record.amountKobo / 100).toFixed(2)} against payment ${payment.reference}. Bank posting times may vary.\n${new URL(`/applicant/payment-return?reference=${payment.reference}`, origin).href}`}, `refund-processed:${id}`, session);
      record.notificationIssuedAt = new Date(); await record.save({session}); return true;
    });
  }
  async function store(reference: string, verified: VerifiedRefund, actor?: Identity, note?: string, authorize?: (actor: Identity, session: ClientSession) => Promise<void>, leaseToken?: string) {
    const result = await connection.transaction(async session => {
      if (actor && authorize) await authorize(actor, session);
      const payment = await Payment.findOne({reference, state: "successful", verifiedAt: {$ne: null}}).session(session);
      if (!payment || verified.transaction !== payment.providerId || verified.currency !== payment.currency || verified.amount > payment.amountKobo) throw new Error("Refund does not match verified payment");
      if (actor?.userId === String(payment.ownerId)) throw new Error("Another staff member must reconcile your refund");
      const existing = await Refund.findOne({providerRefundId: verified.id}).select("+leaseToken").session(session);
      if (leaseToken && (!existing || existing.leaseToken !== leaseToken || existing.leaseUntil <= new Date())) throw new Error("Refund lease expired");
      if (existing && (String(existing.paymentId) !== String(payment._id) || existing.amountKobo !== verified.amount || existing.status === "processed" && verified.status !== "processed")) throw new Error("Refund evidence changed");
      if (!existing && !actor) throw new Error("Staff must initially register a refund reference");
      const all = await Refund.find({paymentId: payment._id, status: "processed", providerRefundId: {$ne: verified.id}}).session(session).lean();
      const total = all.reduce((sum, value) => sum + value.amountKobo, 0) + (verified.status === "processed" ? verified.amount : 0);
      if (total > payment.amountKobo) throw new Error("Refund total exceeds verified payment");
      const changed = !existing || existing.status !== verified.status;
      const record = existing ?? new Refund({paymentId: payment._id, providerRefundId: verified.id, providerTransactionId: verified.transaction, amountKobo: verified.amount, currency: "NGN", recordedBy: actor!.userId, note});
      record.status = verified.status; record.nextCheckAt = new Date(Date.now() + 5 * 60_000); record.lastError = ""; await record.save({session});
      payment.refundedKobo = total; await payment.save({session});
      if (changed) {
        await Audit.create([{...(actor ? {actorId: actor.userId} : {}), action: "payment.refund_verified", entityId: payment._id, summary: {providerRefundId: verified.id, status: verified.status, amountKobo: verified.amount}}], {session});

      }
      return record;
    });
    try {await notify(verified.id);} catch { /* Verified refund truth persists; leased delivery retries later. */ }
    return result;
  }
  async function record(reference: string, id: string, actor: Identity, note: string, authorize: (actor: Identity, session: ClientSession) => Promise<void>) {
    if (!provider?.verifyRefund) throw new Error("Provider refund verification unavailable");
    const verified = await provider.verifyRefund(id); if (verified.id !== id) throw new Error("Refund reference mismatch");
    return store(reference, verified, actor, note, authorize);
  }
  async function runOnce() {
    if (!provider?.verifyRefund) return false;
    const token = randomBytes(24).toString("hex"); const now = new Date();
    const record = await Refund.findOneAndUpdate({$or: [{status: {$in: ["pending", "processing"]}}, {status: "processed", notificationIssuedAt: null}], nextCheckAt: {$lte: now}, leaseUntil: {$lte: now}}, {$set: {leaseUntil: new Date(Date.now() + 30_000), leaseToken: token}}, {returnDocument: "after"}); if (!record) return false;
    try {if (record.status === "processed") {await notify(record.providerRefundId); return true;} const payment = await Payment.findById(record.paymentId).lean(); const result = await provider.verifyRefund(record.providerRefundId); if (!payment || result.id !== record.providerRefundId) throw new Error("Refund reference mismatch"); await store(payment.reference, result, undefined, undefined, undefined, token);}
    catch {await Refund.updateOne({_id: record._id, leaseToken: token}, {$set: {lastError: "refund_verification_unavailable"}});}
    finally {await Refund.updateOne({_id: record._id, leaseToken: token}, {$set: {leaseUntil: new Date(0), leaseToken: "", nextCheckAt: new Date(Date.now() + 5 * 60_000)}});}
    return true;
  }
  return {record, runOnce};
}
