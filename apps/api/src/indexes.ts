import { createPaymentModel } from "./payments/models.js";
import { createOfferModel } from "./offers/models.js";
import { createEventModels } from "./events/models.js";
import { createAdminModels } from "./admin/models.js";
import { createGuardianModel } from "./guardian/models.js";
import { createMediaModel } from "./media/models.js";
import { createApplicationModels } from "./applications/models.js";
import { createRateLimitModel } from "./identity/rate-limit.js";
import { createOutboxModel } from "./mail/models.js";
import { readConfig } from "./config.js";
import { createDatabase } from "./database.js";
import { createIdentityModels, ensureIdentityIndexes } from "./identity/models.js";

const config = readConfig(process.env);
const database = createDatabase(config.mongoUri);
try {
  await database.connect();
  await createPaymentModel(database.connection).createIndexes();
  await createOfferModel(database.connection).createIndexes();
  await ensureIdentityIndexes(createIdentityModels(database.connection));
  await createOutboxModel(database.connection).createIndexes();
  await createRateLimitModel(database.connection).createIndexes();
  await createMediaModel(database.connection).createIndexes();
  await createGuardianModel(database.connection).createIndexes();
  for (const model of Object.values(createEventModels(database.connection))) await model.createIndexes();
  for (const model of Object.values(createAdminModels(database.connection))) await model.createIndexes();
  for (const model of Object.values(createApplicationModels(database.connection))) await model.createIndexes();
  console.log("Application indexes ensured without dropping existing indexes or data");
} catch {
  console.error("Index setup failed. Check database availability and resolve conflicting records before retrying.");
  process.exitCode = 1;
} finally { await database.close(); }
