import express from "express";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createDatabase } from "./database.js";
import { loadOutboxKey } from "./mail/crypto.js";
import { createStorage } from "./media/storage.js";
import { createMailRuntime } from "./mail/runtime.js";
import { readAuthConfig } from "./identity/config.js";
import { createIdentityModels } from "./identity/models.js";
import { createIdentityService } from "./identity/service.js";
import { safeErrorHandler } from "./errors.js";
import { createRequestHandler } from "@react-router/express";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

let config: ReturnType<typeof readConfig>;
try { config = readConfig(process.env); }
catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid API configuration");
  process.exit(1);
}
const database = createDatabase(config.mongoUri);
const identityService = createIdentityService(createIdentityModels(database.connection));
let authConfig: ReturnType<typeof readAuthConfig>;
let mail: Awaited<ReturnType<typeof createMailRuntime>>;
let adminKey: Buffer | null;
try {
  authConfig = readAuthConfig(process.env, config.mode);
  mail = await createMailRuntime(database.connection, process.env, config.mode);
  adminKey = config.mode === "production" && !process.env.OUTBOX_ENCRYPTION_KEY ? null : await loadOutboxKey(config.mode, process.env.OUTBOX_ENCRYPTION_KEY);
} catch { console.error("Invalid authentication or email configuration"); process.exit(1); }
const app = createApp({ isDatabaseReady: database.isReady, identityService, mail, authConfig, adminKey, storage: createStorage(process.env, config.mode) });
const production = config.mode === "production";
const port = config.port;
let stopping = false;
let retry: ReturnType<typeof setTimeout> | undefined;
// Serve liveness even while a database is unavailable; retry initial connection.
async function ensureDatabase() {
  try { await database.connect(); }
  catch { console.warn("MongoDB unavailable; readiness remains false"); }
  if (!stopping) retry = setTimeout(() => { void ensureDatabase(); }, 5000).unref();
}
void ensureDatabase();

if (authConfig.serveWeb) {
  const webBuild = fileURLToPath(new URL("../../web/build/", import.meta.url));
  const build = await import(pathToFileURL(path.join(webBuild, "server/index.js")).href);
  app.use(express.static(path.join(webBuild, "client"), { index: false }));
  app.use(createRequestHandler({ build, mode: "production" }));
}

app.use(safeErrorHandler);

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Psycocity ${production ? "web and API" : "API"} listening on port ${port}`);
});
function shutdown(exitCode: number) {
  if (stopping) return;
  stopping = true;
  clearTimeout(retry);
  const deadline = setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    try { await database.close(); clearTimeout(deadline); process.exit(exitCode); }
    catch { process.exit(1); }
  });
}
server.on("error", () => {
  console.error("API server could not listen on the configured port");
  shutdown(1);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => shutdown(0));
}
