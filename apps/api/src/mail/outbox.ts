import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongoose";
import type { createOutboxModel } from "./models.js";
import { encryptPayload, decryptPayload } from "./crypto.js";
import { mailSchema, type Mail, type MailSender } from "./delivery.js";
export function createOutbox(model: ReturnType<typeof createOutboxModel>, key: Buffer) {
  async function enqueue(mail: Mail, dedupeKey: string, session?: ClientSession) {
    const payload = encryptPayload(mailSchema.parse(mail), key);
    await model.updateOne({ dedupeKey }, { $setOnInsert: { dedupeKey, encryptedPayload: payload, state: "pending", attempts: 0, nextAttemptAt: new Date() } }, { upsert: true, session });
  }
  async function runOnce(sender: MailSender): Promise<boolean> {
    const now = new Date();
    await model.updateMany({ state: "processing", leaseUntil: { $lte: now }, attempts: { $gte: 5 } }, { $set: { state: "failed", lastErrorCode: "RETRIES_EXHAUSTED" }, $unset: { claimId: 1, leaseUntil: 1 } });
    const claimId = randomUUID();
    const job = await model.findOneAndUpdate({ attempts: { $lt: 5 }, $or: [{ state: "pending", nextAttemptAt: { $lte: now } }, { state: "processing", leaseUntil: { $lte: now } }] }, { $set: { state: "processing", claimId, leaseUntil: new Date(Date.now() + 30_000) }, $inc: { attempts: 1 } }, { returnDocument: "after", sort: { nextAttemptAt: 1 } }).select("+encryptedPayload").lean();
    if (!job) return false;
    const claimed = { _id: job._id, claimId, state: "processing" as const };
    try {
      await sender(mailSchema.parse(decryptPayload(job.encryptedPayload!, key)), job.dedupeKey);
      // Remove token-bearing payload after completed delivery; retain safe metadata.
      await model.updateOne(claimed, { $set: { state: "delivered", deliveredAt: new Date() }, $unset: { encryptedPayload: 1, claimId: 1, leaseUntil: 1, lastErrorCode: 1 } });
    } catch {
      await model.updateOne(claimed, { $set: { state: job.attempts >= 5 ? "failed" : "pending", nextAttemptAt: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** job.attempts)), lastErrorCode: "DELIVERY_FAILED" }, $unset: { claimId: 1, leaseUntil: 1 } });
    }
    return true;
  }
  return { enqueue, runOnce };
}
