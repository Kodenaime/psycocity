import { Schema, type Connection } from "mongoose";
import { photoSlots } from "@psycocity/validation";
const mediaSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  applicationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  slot: { type: String, enum: photoSlots, required: true },
  storageKey: { type: String, required: true },
  status: { type: String, enum: ["pending", "processing", "ready", "rejected", "deleted"], required: true, default: "pending" },
  retainedForSubmission: { type: Boolean, required: true, default: false },
  active: { type: Boolean, required: true, default: false },
  uploadTokenHash: { type: String, select: false },
  expiresAt: { type: Date, required: true },
  width: Number, height: Number, bytes: Number, purgedAt: Date,
}, { timestamps: true, strict: "throw" });
mediaSchema.index({ applicationId: 1, active: 1 });
mediaSchema.index({ status: 1, expiresAt: 1 });
mediaSchema.index({ storageKey: 1 }, { unique: true });
export function createMediaModel(connection: Connection) {
  return connection.models.MediaAsset as ReturnType<typeof build> ?? build();
  function build() { return connection.model("MediaAsset", mediaSchema); }
}
