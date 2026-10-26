import { Schema, type Connection } from "mongoose";
const schema = new Schema({
  offerId: {type: Schema.Types.ObjectId, required: true, immutable: true}, applicationId: {type: Schema.Types.ObjectId, required: true, immutable: true}, ownerId: {type: Schema.Types.ObjectId, required: true, immutable: true},
  reference: {type: String, required: true, immutable: true}, amountKobo: {type: Number, required: true, immutable: true}, currency: {type: String, enum: ["NGN"], required: true, immutable: true},
  termsVersion: {type: String, required: true, immutable: true}, termsAcceptedAt: {type: Date, required: true, immutable: true},
  membershipProvisionedAt: Date, membershipRevision: {type: Number, default: 0}, membershipNextAttemptAt: {type: Date, default: Date.now}, verifiedAt: Date, providerId: String, paidAt: Date, receiptIssuedAt: Date,
  reviewReason: {type: String, enum: ["", "verification_mismatch", "late_settlement", "duplicate_charge", "eligibility_changed"], default: ""},
  nextVerifyAt: {type: Date, default: Date.now}, verificationLeaseUntil: {type: Date, default: () => new Date(0)}, verificationLeaseToken: {type: String, select: false}, verificationAttempts: {type: Number, default: 0}, lastVerificationError: {type: String, default: ""}, refundedKobo: {type: Number, default: 0},
  state: {type: String, enum: ["initializing", "initialized", "initialization_unknown", "successful", "failed"], default: "initializing", required: true},
  active: {type: Boolean, default: true, required: true}, checkoutUrl: {type: String, select: false}, initializationExpiresAt: {type: Date, required: true},
}, {timestamps: true, strict: "throw", versionKey: false});
schema.index({state: 1, membershipNextAttemptAt: 1});
schema.index({state: 1, nextVerifyAt: 1, verificationLeaseUntil: 1});
schema.index({providerId: 1}, {unique: true, partialFilterExpression: {providerId: {$type: "string"}}});
schema.index({reference: 1}, {unique: true}); schema.index({offerId: 1}, {unique: true, partialFilterExpression: {active: true}}); schema.index({ownerId: 1, createdAt: -1});
export function createPaymentModel(connection: Connection) {return connection.models.Payment as ReturnType<typeof build> ?? build(); function build() {return connection.model("Payment", schema);}}

const eventSchema = new Schema({eventKey: {type: String, required: true, immutable: true}, reference: {type: String, required: true, immutable: true}, providerId: {type: String, required: true, immutable: true}, type: {type: String, required: true, immutable: true}}, {timestamps: true, strict: "throw"}); eventSchema.index({eventKey: 1}, {unique: true});
const receiptSchema = new Schema({paymentId: {type: Schema.Types.ObjectId, required: true, immutable: true}, ownerId: {type: Schema.Types.ObjectId, required: true, immutable: true}, reference: {type: String, required: true, immutable: true}, number: {type: String, required: true, immutable: true}, amountKobo: {type: Number, required: true, immutable: true}, currency: {type: String, enum: ["NGN"], required: true, immutable: true}, paidAt: {type: Date, required: true, immutable: true}, termsVersion: {type: String, required: true, immutable: true}}, {timestamps: true, strict: "throw"}); receiptSchema.index({paymentId: 1}, {unique: true}); receiptSchema.index({number: 1}, {unique: true});
export function createFinancialModels(connection: Connection) {
  return {Event: connection.models.PaymentEvent as ReturnType<typeof event> ?? event(), Receipt: connection.models.PaymentReceipt as ReturnType<typeof receipt> ?? receipt()};
  function event() {return connection.model("PaymentEvent", eventSchema);} function receipt() {return connection.model("PaymentReceipt", receiptSchema);}
}
const refundSchema = new Schema({paymentId: {type: Schema.Types.ObjectId, required: true, immutable: true}, providerRefundId: {type: String, required: true, immutable: true}, providerTransactionId: {type: String, required: true, immutable: true}, amountKobo: {type: Number, required: true, immutable: true}, currency: {type: String, enum: ["NGN"], required: true, immutable: true}, status: {type: String, enum: ["pending", "processing", "processed", "failed"], required: true}, recordedBy: {type: Schema.Types.ObjectId, required: true, immutable: true}, note: {type: String, required: true, immutable: true}, notificationIssuedAt: Date, nextCheckAt: {type: Date, default: Date.now}, leaseUntil: {type: Date, default: () => new Date(0)}, leaseToken: {type: String, select: false}, lastError: {type: String, default: ""}}, {timestamps: true, strict: "throw"}); refundSchema.index({providerRefundId: 1}, {unique: true}); refundSchema.index({paymentId: 1, createdAt: -1}); refundSchema.index({status: 1, nextCheckAt: 1, leaseUntil: 1});
export function createRefundModel(connection: Connection) {return connection.models.PaymentRefund as ReturnType<typeof build> ?? build(); function build() {return connection.model("PaymentRefund", refundSchema);}}
