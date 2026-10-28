import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongoose";
import type { createOutboxModel } from "./models.js";
import { encryptPayload, decryptPayload } from "./crypto.js";
import { mailSchema, MailDeliveryError, type Mail, type MailSender } from "./delivery.js";
export function createOutbox(model: ReturnType<typeof createOutboxModel>, key: Buffer) {
  async function enqueue(mail: Mail, dedupeKey: string, session?: ClientSession, payloadExpiresAt?: Date) {
    const payload = encryptPayload(mailSchema.parse(mail), key);
    await model.updateOne({ dedupeKey }, { $setOnInsert: { dedupeKey, encryptedPayload: payload, state: "pending", attempts: 0, nextAttemptAt: new Date(), ...(payloadExpiresAt ? {payloadExpiresAt} : {}) } }, { upsert: true, session });
  }
  async function runOnce(sender: MailSender): Promise<boolean> {
    const now = new Date();
    await model.updateMany({payloadExpiresAt: {$lte: now}, encryptedPayload: {$exists: true}}, {$set: {state: "failed", lastErrorCode: "PAYLOAD_EXPIRED"}, $unset: {encryptedPayload: 1, claimId: 1, leaseUntil: 1}});
    await model.updateMany({ state: "processing", leaseUntil: { $lte: now }, attempts: { $gte: 5 } }, { $set: { state: "failed", lastErrorCode: "RETRIES_EXHAUSTED" }, $unset: { claimId: 1, leaseUntil: 1 } });
    const claimId = randomUUID();
    const job = await model.findOneAndUpdate({ attempts: { $lt: 5 }, $and: [{$or: [{payloadExpiresAt: {$exists: false}}, {payloadExpiresAt: {$gt: now}}]}], $or: [{ state: "pending", nextAttemptAt: { $lte: now } }, { state: "processing", leaseUntil: { $lte: now } }] }, { $set: { state: "processing", claimId, leaseUntil: new Date(Date.now() + 30_000) }, $inc: { attempts: 1 } }, { returnDocument: "after", sort: { nextAttemptAt: 1 } }).select("+encryptedPayload").lean();
    if (!job) return false;
    const claimed = { _id: job._id, claimId, state: "processing" as const };
    let stage: "payload" | "send" = "payload";
    try {
      const payload = mailSchema.parse(decryptPayload(job.encryptedPayload!, key));
      stage = "send";
      await sender(payload, job.dedupeKey);
      // Remove token-bearing payload after completed delivery; retain safe metadata.
      await model.updateOne(claimed, { $set: { state: "delivered", deliveredAt: new Date() }, $unset: { encryptedPayload: 1, claimId: 1, leaseUntil: 1, lastErrorCode: 1 } });
    } catch (error) {
      const code = stage === "payload" ? "PAYLOAD_UNREADABLE" : error instanceof MailDeliveryError ? error.code : "DELIVERY_FAILED";
      console.warn(`Email delivery attempt failed: ${code}`);
      await model.updateOne(claimed, { $set: { state: job.attempts >= 5 ? "failed" : "pending", nextAttemptAt: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** job.attempts)), lastErrorCode: code }, $unset: { claimId: 1, leaseUntil: 1 } });
    }
    return true;
  }
  return { enqueue, runOnce };
}
