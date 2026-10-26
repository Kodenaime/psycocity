import { Schema, type Connection } from "mongoose";
const schema = new Schema({
  applicationId: {type: Schema.Types.ObjectId, required: true, immutable: true}, ownerId: {type: Schema.Types.ObjectId, required: true, immutable: true},
  track: {type: String, enum: ["academy", "established"], required: true, immutable: true},
  amountKobo: {type: Number, required: true, immutable: true}, currency: {type: String, enum: ["NGN"], required: true, immutable: true},
  termsVersion: {type: String, required: true, immutable: true}, termsText: {type: String, required: true, immutable: true},
  expiresAt: {type: Date, required: true, immutable: true}, issuedBy: {type: Schema.Types.ObjectId, required: true, immutable: true},
  revision: {type: Number, required: true, immutable: true}, applicationVersion: {type: Number, required: true, immutable: true},
  active: {type: Boolean, required: true, default: true}, status: {type: String, enum: ["issued", "replaced", "paid"], default: "issued", required: true},
}, {timestamps: true, strict: "throw", versionKey: false});
schema.index({applicationId: 1}, {unique: true, partialFilterExpression: {active: true}});
schema.index({applicationId: 1, revision: 1}, {unique: true});
schema.index({ownerId: 1, createdAt: -1});
export function createOfferModel(connection: Connection) {
  return connection.models.AdmissionOffer as ReturnType<typeof build> ?? build();
  function build() {return connection.model("AdmissionOffer", schema);}
}
