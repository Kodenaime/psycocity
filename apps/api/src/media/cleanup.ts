import { readConfig } from "../config.js";
import { createDatabase } from "../database.js";
import { createMediaModel } from "./models.js";
import { createStorage } from "./storage.js";
import { cleanOrphanedMedia } from "./cleanup-service.js";
const config = readConfig(process.env); const database = createDatabase(config.mongoUri);
try {
  const storage = createStorage(process.env, config.mode);
  if (!storage) throw new Error("Media storage disabled");
  await database.connect();
  const result = await cleanOrphanedMedia(createMediaModel(database.connection), storage);
  console.log(`Private media cleanup: ${result.purged} purged, ${result.failed} failed`);
  if (result.failed) process.exitCode = 1;
} catch { console.error("Private media cleanup could not complete"); process.exitCode = 1; }
finally { await database.close(); }
