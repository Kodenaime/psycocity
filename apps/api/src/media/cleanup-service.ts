import type { createMediaModel } from "./models.js";
import type { PrivateStorage } from "./storage.js";
export async function cleanOrphanedMedia(model: ReturnType<typeof createMediaModel>, storage: PrivateStorage, cutoff = new Date(Date.now() - 24 * 60 * 60_000)) {
  const values = await model.find({ active: false, retainedForSubmission: { $ne: true }, purgedAt: null, $or: [{ status: { $in: ["deleted", "rejected", "ready"] }, updatedAt: { $lt: cutoff } }, { status: { $in: ["pending", "processing"] }, expiresAt: { $lt: cutoff } }] }).limit(100).lean();
  let purged = 0; let failed = 0;
  for (const value of values) {
    try { await storage.remove(value.storageKey); await model.updateOne({ _id: value._id, active: false }, { $set: { status: "deleted", purgedAt: new Date() }, $unset: { uploadTokenHash: 1 } }); purged += 1; }
    catch { failed += 1; }
  }
  return { purged, failed };
}
