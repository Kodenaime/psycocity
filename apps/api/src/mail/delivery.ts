import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import { z } from "@psycocity/validation";
import { localDirectory } from "./crypto.js";
export const mailSchema = z.object({ to: z.email(), subject: z.string().min(1).max(200), text: z.string().min(1).max(50_000) }).strict();
export type Mail = z.infer<typeof mailSchema>;
export class MailDeliveryError extends Error {
  constructor(public readonly code: "RESEND_AUTH_REJECTED" | "RESEND_SENDER_OR_PERMISSION_REJECTED" | "RESEND_REQUEST_REJECTED" | "RESEND_RATE_LIMITED" | "RESEND_UNAVAILABLE") { super(code); }
}
export type MailSender = (mail: Mail, dedupeKey: string) => Promise<void>;
export function localMailSender(mode: string, directory = `${localDirectory}/mail`): MailSender {
  if (mode === "production") throw new Error("Local email delivery is forbidden in production");
  return async (mail, dedupeKey) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = createHash("sha256").update(dedupeKey).digest("hex");
    const temporary = `${directory}/${filename}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(mailSchema.parse(mail)), { flag: "wx", mode: 0o600 });
      await rename(temporary, `${directory}/${filename}.json`);
    } catch (error) { throw new Error("Local email delivery failed", { cause: error }); }
    finally { await rm(temporary, { force: true }); }
  };
}
export function resendMailSender(key: string, from: string): MailSender {
  return async (mail, dedupeKey) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": createHash("sha256").update(dedupeKey).digest("hex") },
      body: JSON.stringify({ from, ...mailSchema.parse(mail) }),
    });
    if (!response.ok) throw new MailDeliveryError(response.status === 401 ? "RESEND_AUTH_REJECTED" : response.status === 403 ? "RESEND_SENDER_OR_PERMISSION_REJECTED" : response.status === 429 ? "RESEND_RATE_LIMITED" : response.status >= 500 ? "RESEND_UNAVAILABLE" : "RESEND_REQUEST_REJECTED");
  };
}
