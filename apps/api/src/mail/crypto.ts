import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, link, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
export function encryptPayload(value: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decryptPayload(value: string, key: Buffer): unknown {
  const bytes = Buffer.from(value, "base64");
  const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8"));
}
export const localDirectory = fileURLToPath(new URL("../../../../.local/", import.meta.url));
export async function loadOutboxKey(mode: string, value?: string, directory = localDirectory): Promise<Buffer> {
  if (value) {
    const key = Buffer.from(value, "base64");
    if (key.length !== 32 || key.toString("base64") !== value) throw new Error("OUTBOX_ENCRYPTION_KEY must encode exactly 32 random bytes");
    return key;
  }
  if (mode === "production") throw new Error("OUTBOX_ENCRYPTION_KEY is required for production email");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = `${directory}/outbox-key`;
  try { return await readKey(); }
  catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw new Error("Local outbox key could not be read", { cause: error });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, randomBytes(32), { flag: "wx", mode: 0o600 });
      // Link a complete file atomically without replacing a concurrently created key.
      await link(temporary, path);
    } catch (writeError) { if (!(writeError instanceof Error) || !("code" in writeError) || writeError.code !== "EEXIST") throw new Error("Local outbox key could not be created", { cause: writeError }); }
    finally { await rm(temporary, { force: true }); }
    return readKey();
  }
  async function readKey() {
    const key = await readFile(path);
    if (key.length !== 32) throw new Error("Local outbox key is invalid; do not replace it while encrypted jobs exist");
    return key;
  }
}
