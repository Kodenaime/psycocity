import { Schema, type Connection } from "mongoose";
const schema = new Schema({
  applicationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  ownerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  guardianName: { type: String, required: true }, guardianEmail: { type: String, required: true },
  relationship: { type: String, enum: ["parent", "legal_guardian"], required: true },
  policyVersion: { type: String, required: true }, subjectHash: { type: String, required: true },
  status: { type: String, enum: ["pending", "consented", "declined", "withdrawn", "superseded"], default: "pending", required: true },
  tokenHash: { type: String, required: true, select: false }, expiresAt: { type: Date, required: true },
  verifiedAt: Date, consentedAt: Date, withdrawnAt: Date, declaration: String,
  withdrawalHash: { type: String, select: false }, withdrawalExpiresAt: Date,
}, { timestamps: true, strict: "throw" });
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ applicationId: 1, createdAt: -1 });
schema.index({ withdrawalHash: 1 }, { unique: true, partialFilterExpression: { withdrawalHash: { $type: "string" } } });
// Consent evidence is not TTL-deleted; retention policy is a separate operation.
export function createGuardianModel(connection: Connection) {
  return connection.models.GuardianConsent as ReturnType<typeof build> ?? build();
  function build() { return connection.model("GuardianConsent", schema); }
}
