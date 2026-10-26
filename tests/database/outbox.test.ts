import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../apps/api/src/database.js";
import { testMongoUri } from "../../apps/api/src/config.js";
import { createOutboxModel } from "../../apps/api/src/mail/models.js";
import { createOutbox } from "../../apps/api/src/mail/outbox.js";
import { localMailSender } from "../../apps/api/src/mail/delivery.js";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated _test database required");
const database = createDatabase(uri);
const isolatedName = `outbox_${randomUUID().replaceAll("-", "")}_test`;
const model = createOutboxModel(database.connection.useDb(isolatedName));
const outbox = createOutbox(model, randomBytes(32));
let directory: string;
const mail = { to: "outbox-test@example.test", subject: "Local test", text: "private-link-fixture-for-delivery" };
beforeAll(async () => {
  await database.connect();
  await model.createIndexes();
  await mkdir(".cache", { recursive: true });
  directory = await mkdtemp(".cache/mail-test-");
});
afterAll(async () => {
  try { if (database.connection.readyState === 1) await model.collection.drop(); }
  finally { await database.close(); if (directory) await rm(directory, { recursive: true, force: true }); }
});

describe("durable encrypted email outbox", () => {
  it("deduplicates, stores ciphertext and removes sensitive payload after delivery", async () => {
    await outbox.enqueue(mail, "deduplicated");
    await outbox.enqueue(mail, "deduplicated");
    expect(await model.countDocuments({ dedupeKey: "deduplicated" })).toBe(1);
    const stored = await model.findOne({ dedupeKey: "deduplicated" }).select("+encryptedPayload").lean();
    expect(stored?.encryptedPayload).not.toContain(mail.text);
    expect(stored?.encryptedPayload).not.toContain(mail.to);
    expect(await outbox.runOnce(localMailSender("test", directory))).toBe(true);
    const complete = await model.findOne({ dedupeKey: "deduplicated" }).select("+encryptedPayload").lean();
    expect(complete?.state).toBe("delivered");
    expect(complete?.encryptedPayload).toBeUndefined();
    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    expect(JSON.parse(await readFile(`${directory}/${files[0]}`, "utf8"))).toEqual(mail);
  });
  it("retries failures with backoff and safe error metadata", async () => {
    await outbox.enqueue(mail, "retry");
    await outbox.runOnce(async () => { throw new Error("private-provider-secret"); });
    let job = await model.findOne({ dedupeKey: "retry" }).lean();
    expect(job?.state).toBe("pending");
    expect(job?.attempts).toBe(1);
    expect(job?.lastErrorCode).toBe("DELIVERY_FAILED");
    expect(JSON.stringify(job)).not.toContain("private-provider-secret");
    await model.updateOne({ dedupeKey: "retry" }, { $set: { nextAttemptAt: new Date(0) } });
    await outbox.runOnce(localMailSender("test", directory));
    job = await model.findOne({ dedupeKey: "retry" }).lean();
    expect(job?.state).toBe("delivered");
    expect(job?.attempts).toBe(2);
  });
  it("allows only one concurrent worker to claim the same job", async () => {
    await outbox.enqueue(mail, "concurrent");
    let deliveries = 0;
    const sender = async () => { deliveries += 1; };
    await Promise.all([outbox.runOnce(sender), outbox.runOnce(sender)]);
    expect(deliveries).toBe(1);
  });
  it("recovers an abandoned lease while respecting unexpired leases", async () => {
    await outbox.enqueue(mail, "lease");
    await model.updateOne({ dedupeKey: "lease" }, { $set: { state: "processing", leaseUntil: new Date(Date.now() + 60_000), claimId: "old-worker", attempts: 1 } });
    expect(await outbox.runOnce(localMailSender("test", directory))).toBe(false);
    await model.updateOne({ dedupeKey: "lease" }, { $set: { leaseUntil: new Date(0) } });
    expect(await outbox.runOnce(localMailSender("test", directory))).toBe(true);
    expect((await model.findOne({ dedupeKey: "lease" }).lean())?.state).toBe("delivered");
  });
  it("stops retrying after five claims", async () => {
    await outbox.enqueue(mail, "exhausted");
    await model.updateOne({ dedupeKey: "exhausted" }, { $set: { attempts: 4 } });
    await outbox.runOnce(async () => { throw new Error("failed"); });
    const job = await model.findOne({ dedupeKey: "exhausted" }).lean();
    expect(job?.state).toBe("failed");
    expect(job?.attempts).toBe(5);
    expect(await outbox.runOnce(localMailSender("test", directory))).toBe(false);
  });
});
