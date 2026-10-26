import type { Connection } from "mongoose";
import { loadOutboxKey } from "./crypto.js";
import { createOutboxModel } from "./models.js";
import { createOutbox } from "./outbox.js";
import { localMailSender, resendMailSender } from "./delivery.js";
export async function createMailRuntime(connection: Connection, env: Record<string, string | undefined>, mode: string) {
  const transport = env.EMAIL_TRANSPORT ?? (mode === "production" ? "disabled" : "local");
  if (transport === "disabled") return null;
  if (!["local", "resend"].includes(transport)) throw new Error("EMAIL_TRANSPORT must be local, resend or disabled");
  if (transport === "local" && mode === "production") throw new Error("Local email delivery is forbidden in production");
  if (transport === "resend" && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) throw new Error("Resend requires RESEND_API_KEY and EMAIL_FROM");
  const key = await loadOutboxKey(mode, env.OUTBOX_ENCRYPTION_KEY);
  const model = createOutboxModel(connection);
  const outbox = createOutbox(model, key);
  const sender = transport === "local" ? localMailSender(mode) : resendMailSender(env.RESEND_API_KEY!, env.EMAIL_FROM!);
  return { ...outbox, model, sender };
}
