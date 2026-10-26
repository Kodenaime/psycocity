import { Schema, type Connection } from "mongoose";
const outboxSchema = new Schema({
  dedupeKey: { type: String, required: true },
  encryptedPayload: { type: String, select: false },
  payloadExpiresAt: Date,
  state: { type: String, enum: ["pending", "processing", "delivered", "failed"], default: "pending", required: true },
  attempts: { type: Number, default: 0, required: true },
  nextAttemptAt: { type: Date, default: Date.now, required: true },
  leaseUntil: Date,
  claimId: String,
  deliveredAt: Date,
  lastErrorCode: String,
}, { timestamps: true, strict: "throw" });
outboxSchema.index({ dedupeKey: 1 }, { unique: true, name: "unique_outbox_dedupe" });
outboxSchema.index({ state: 1, nextAttemptAt: 1 });
outboxSchema.index({ state: 1, leaseUntil: 1 });
export function createOutboxModel(connection: Connection) {
  return connection.models.OutboxJob as ReturnType<typeof build> ?? build();
  function build() { return connection.model("OutboxJob", outboxSchema); }
}
