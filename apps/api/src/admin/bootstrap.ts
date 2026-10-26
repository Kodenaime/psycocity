import { emailSchema } from "@psycocity/validation";
import { readConfig } from "../config.js";
import { readAuthConfig } from "../identity/config.js";
import { createDatabase } from "../database.js";
import { createIdentityModels, ensureIdentityIndexes } from "../identity/models.js";
import { createIdentityService } from "../identity/service.js";
import { loadOutboxKey } from "../mail/crypto.js";
import { createMailRuntime } from "../mail/runtime.js";
import { createAdminService, AdminActionError } from "./service.js";

const args = process.argv.slice(2); const value = args[args.indexOf("--email") + 1];
const email = args.includes("--email") ? emailSchema.safeParse(value) : null;
if (!email?.success) { console.error("Provide a valid --email option. No passwords or invitation keys belong on the command line."); process.exit(1); }
const config = readConfig(process.env); const database = createDatabase(config.mongoUri);
try {
  const auth = readAuthConfig(process.env, config.mode);
  const key = await loadOutboxKey(config.mode, process.env.OUTBOX_ENCRYPTION_KEY);
  const identity = createIdentityService(createIdentityModels(database.connection));
  const mail = await createMailRuntime(database.connection, process.env, config.mode);
  if (!mail) throw new AdminActionError("Configure staff email before bootstrap");
  const service = createAdminService(identity, mail, key, auth.origin);
  await database.connect(); await ensureIdentityIndexes(identity.models);
  await mail.model.createIndexes(); for (const model of Object.values(service.models)) await model.createIndexes();
  await service.bootstrap(email.data, args.includes("--reissue"));
  console.log("Initial staff invitation queued. The email worker delivers it privately; no credential was printed.");
} catch (error) { console.error(error instanceof AdminActionError ? error.message : "Initial staff setup could not complete; check configuration and database availability"); process.exitCode = 1; }
finally { await database.close(); }
