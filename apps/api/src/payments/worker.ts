import { validateDeployment } from "../deployment.js";
import { createMembershipService } from "../members/service.js";
import { readConfig } from "../config.js";
import { createDatabase } from "../database.js";
import { createIdentityModels } from "../identity/models.js";
import { createIdentityService } from "../identity/service.js";
import { createMailRuntime } from "../mail/runtime.js";
import { readAuthConfig } from "../identity/config.js";
import { createVerificationProvider } from "./verification-provider.js";
import { createSettlementService } from "./settlement.js";
import { createRefundService } from "./refunds.js";
validateDeployment(process.env);
const config = readConfig(process.env); const database = createDatabase(config.mongoUri); let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {stopping = true;});
try {
  await database.connect(); const identity = createIdentityService(createIdentityModels(database.connection)); const provider = createVerificationProvider(process.env, config.mode); const mail = await createMailRuntime(database.connection, process.env, config.mode); const {origin} = readAuthConfig(process.env, config.mode);
  const memberships = createMembershipService(identity, mail, origin);
  const settlement = createSettlementService(identity, provider, mail, origin); const refunds = createRefundService(identity, provider, mail, origin);
  console.log(provider ? "Payment reconciliation worker started in test mode" : "Provider verification idle: test provider not configured; paid membership recovery remains enabled");
  while (!stopping) {const settled = await settlement.runOnce(); const refunded = await refunds.runOnce(); const invited = await memberships.backfillOnce(); if (!settled && !refunded && !invited) await new Promise(resolve => setTimeout(resolve, 500));}
} catch {console.error("Payment worker stopped after a configuration or database error"); process.exitCode = 1;}
finally {await database.close();}
