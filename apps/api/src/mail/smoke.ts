import { randomUUID } from "node:crypto";
import { readConfig } from "../config.js";
import { createDatabase } from "../database.js";
import { createMailRuntime } from "./runtime.js";
const config = readConfig(process.env);
if (config.mode === "production" || (process.env.EMAIL_TRANSPORT && process.env.EMAIL_TRANSPORT !== "local")) throw new Error("Email smoke is local-only");
const database = createDatabase(config.mongoUri);
try {
  await database.connect();
  const mail = await createMailRuntime(database.connection, { ...process.env, EMAIL_TRANSPORT: "local" }, config.mode);
  if (!mail) throw new Error("Local email unavailable");
  await mail.model.createIndexes();
  const dedupeKey = `local-smoke:${randomUUID()}`;
  await mail.enqueue({ to: "local-smoke@example.test", subject: "Psycocity local delivery check", text: "This development-only message confirms the durable email worker is connected." }, dedupeKey);
  // Process jobs until this queued smoke is delivered; never log message bodies.
  for (let i = 0; i < 100; i++) {
    await mail.runOnce(mail.sender);
    if ((await mail.model.findOne({ dedupeKey }).lean())?.state === "delivered") { console.log("Local email smoke delivered; no external message was sent"); break; }
    if (i === 99) throw new Error("Local email smoke did not complete");
  }
} catch { console.error("Local email smoke failed"); process.exitCode = 1; }
finally { await database.close(); }
