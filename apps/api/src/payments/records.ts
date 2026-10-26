import { Types } from "mongoose";
import type { IdentityService } from "../identity/service.js";
import { createFinancialModels, createPaymentModel, createRefundModel } from "./models.js";
export function createPaymentReader(identity: IdentityService) {
  const connection = identity.models.User.db; const Payment = createPaymentModel(connection); const {Receipt} = createFinancialModels(connection); const Refund = createRefundModel(connection);
  type Payment = NonNullable<Awaited<ReturnType<typeof Payment.findOne>>>;
  const summary = (value: Payment) => ({reference: value.reference, amountKobo: value.amountKobo, currency: value.currency, state: value.state, reviewReason: value.reviewReason, refundedKobo: value.refundedKobo, createdAt: value.createdAt.toISOString(), verifiedAt: value.verifiedAt?.toISOString() ?? null, applicationId: String(value.applicationId)});
  async function list(query: {cursor?: string; limit: number; review?: string}, ownerId?: string) {
    const rows = await Payment.find({...(ownerId ? {ownerId} : {}), ...(query.cursor ? {_id: {$lt: new Types.ObjectId(query.cursor)}} : {}), ...(query.review === "anomalies" ? {reviewReason: {$ne: ""}} : query.review === "unresolved" ? {state: {$ne: "successful"}} : query.review === "successful" ? {state: "successful"} : {})}).sort({_id: -1}).limit(query.limit + 1);
    const page = rows.slice(0, query.limit); return {items: page.map(summary), nextCursor: rows.length > query.limit ? String(page.at(-1)!._id) : null};
  }
  async function detail(reference: string, ownerId?: string) {
    const payment = await Payment.findOne({reference, ...(ownerId ? {ownerId} : {})}); if (!payment) return null;
    const [receipt, refunds] = await Promise.all([Receipt.findOne({paymentId: payment._id}).lean(), Refund.find({paymentId: payment._id}).sort({createdAt: -1}).limit(100).lean()]);
    return {...summary(payment), receipt: receipt ? {number: receipt.number, amountKobo: receipt.amountKobo, currency: receipt.currency, paidAt: receipt.paidAt.toISOString(), termsVersion: receipt.termsVersion} : null, refunds: refunds.map(value => ({providerRefundId: value.providerRefundId, amountKobo: value.amountKobo, status: value.status, updatedAt: value.updatedAt.toISOString(), ...(!ownerId ? {internalNote: value.note} : {})}))};
  }
  return {list, detail};
}
