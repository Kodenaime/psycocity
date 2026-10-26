import { Schema, type Connection } from "mongoose";
import { hashToken } from "./service.js";
export function createRateLimitModel(connection: Connection) {
  const schema = new Schema({ keyHash: { type: String, required: true }, count: { type: Number, required: true }, expiresAt: { type: Date, required: true } }, { strict: "throw" });
  schema.index({ keyHash: 1 }, { unique: true });
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return connection.models.RateLimit as ReturnType<typeof build> ?? build();
  function build() { return connection.model("RateLimit", schema); }
}
export function createRateLimiter(model: ReturnType<typeof createRateLimitModel>) {
  return async (scope: string, value: string, limit: number, windowMs = 15 * 60 * 1000) => {
    const bucket = Math.floor(Date.now() / windowMs);
    const keyHash = hashToken(`${scope}:${bucket}:${value}`);
    const result = await model.findOneAndUpdate({ keyHash }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * windowMs) } }, { upsert: true, returnDocument: "after" }).lean();
    return result.count <= limit;
  };
}
