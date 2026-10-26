import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encryptPayload, decryptPayload, loadOutboxKey } from "../../apps/api/src/mail/crypto.js";
import { localMailSender } from "../../apps/api/src/mail/delivery.js";

describe("email protection boundaries", () => {
  it("authenticates ciphertext and rejects wrong keys", () => {
    const key = randomBytes(32);
    const encrypted = encryptPayload({ text: "private-fixture" }, key);
    expect(decryptPayload(encrypted, key)).toEqual({ text: "private-fixture" });
    expect(() => decryptPayload(encrypted, randomBytes(32))).toThrow();
    const altered = Buffer.from(encrypted, "base64"); altered[altered.length - 1] ^= 1;
    expect(() => decryptPayload(altered.toString("base64"), key)).toThrow();
  });
  it("creates one complete key under concurrent first-start processes", async () => {
    await mkdir(".cache", { recursive: true }); const directory = await mkdtemp(".cache/outbox-key-test-");
    try {
      const keys = await Promise.all(Array.from({ length: 8 }, () => loadOutboxKey("test", undefined, directory)));
      expect(keys.every(key => key.length === 32 && key.equals(keys[0]!))).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("forbids local delivery and generated development keys in production", async () => {
    expect(() => localMailSender("production")).toThrow("forbidden");
    await expect(loadOutboxKey("production")).rejects.toThrow("required");
    await expect(loadOutboxKey("production", "invalid")).rejects.toThrow("32 random bytes");
  });
});
