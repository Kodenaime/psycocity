import { createMediaModel } from "../../apps/api/src/media/models.js";
import { localPrivateStorage } from "../../apps/api/src/media/storage.js";
import { createDatabase } from "../../apps/api/src/database.js";
export default async function teardown() {
  const name = process.env.PSYC_E2E_OWNED_DATABASE;
  const uri = process.env.TEST_MONGODB_URI;
  // Never delete a supplied/custom database. Only remove this run's own fixture DB.
  if (!name || !/^psycocity_e2e_[0-9a-f]{32}_test$/.test(name) || uri !== `mongodb://127.0.0.1:27018/${name}?replicaSet=rs0&directConnection=true`) return;
  const database = createDatabase(uri);
  try { await database.connect();
    const storage = localPrivateStorage("test");
    for (const asset of await createMediaModel(database.connection).find().select("storageKey").lean()) await storage.remove(asset.storageKey);
    await database.connection.db!.dropDatabase(); }
  finally { await database.close(); }
}
