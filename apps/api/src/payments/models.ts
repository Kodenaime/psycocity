import { Schema, type Connection } from "mongoose";
const schema = new Schema({
  offerId: {type: Schema.Types.ObjectId, required: true, immutable: true}, applicationId: {type: Schema.Types.ObjectId, required: true, immutable: true}, ownerId: {type: Schema.Types.ObjectId, required: true, immutable: true},
  reference: {type: String, required: true, immutable: true}, amountKobo: {type: Number, required: true, immutable: true}, currency: {type: String, enum: ["NGN"], required: true, immutable: true},
  termsVersion: {type: String, required: true, immutable: true}, termsAcceptedAt: {type: Date, required: true, immutable: true},
  state: {type: String, enum: ["initializing", "initialized", "initialization_unknown", "successful", "failed"], default: "initializing", required: true},
  active: {type: Boolean, default: true, required: true}, checkoutUrl: {type: String, select: false}, initializationExpiresAt: {type: Date, required: true},
}, {timestamps: true, strict: "throw", versionKey: false});
schema.index({reference: 1}, {unique: true}); schema.index({offerId: 1}, {unique: true, partialFilterExpression: {active: true}}); schema.index({ownerId: 1, createdAt: -1});
export function createPaymentModel(connection: Connection) {return connection.models.Payment as ReturnType<typeof build> ?? build(); function build() {return connection.model("Payment", schema);}}
