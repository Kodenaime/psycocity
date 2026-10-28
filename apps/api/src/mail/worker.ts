import { validateDeployment } from "../deployment.js";
import { createAcademyNotifications } from "../academy/notifications.js";
import { createEnquiryNotifications } from "../enquiries/notifications.js";
import { createIdentityModels } from "../identity/models.js";
import { createIdentityService } from "../identity/service.js";
import { readAuthConfig } from "../identity/config.js";
import { readConfig } from "../config.js";
import { createDatabase } from "../database.js";
import { createMailRuntime } from "./runtime.js";
validateDeployment(process.env);
const config = readConfig(process.env);
const database = createDatabase(config.mongoUri);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { stopping = true; });
try {
  await database.connect();
  const mail = await createMailRuntime(database.connection, process.env, config.mode);
  if (!mail) throw new Error("Email transport is disabled");
  const enquiries = createEnquiryNotifications(createIdentityService(createIdentityModels(database.connection)), mail, readAuthConfig(process.env, config.mode).origin);
  const academy = createAcademyNotifications(createIdentityService(createIdentityModels(database.connection)), mail, readAuthConfig(process.env, config.mode).origin);
  console.log(`Email worker started; transport=${process.env.EMAIL_TRANSPORT ?? "local"}`);
  while (!stopping) {
    const delivered = await mail.runOnce(mail.sender); const notified = await enquiries.runOnce(); const scheduled = await academy.runOnce(); if (!delivered && !notified && !scheduled) await new Promise(resolve => setTimeout(resolve, 500));
  }
} catch {
  console.error("Email worker stopped after a configuration or database error");
  process.exitCode = 1;
} finally { await database.close(); }
