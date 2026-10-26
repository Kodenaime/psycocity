import { readConfig } from "../config.js";
import { createDatabase } from "../database.js";
import { createMailRuntime } from "./runtime.js";
const config = readConfig(process.env);
const database = createDatabase(config.mongoUri);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { stopping = true; });
try {
  await database.connect();
  const mail = await createMailRuntime(database.connection, process.env, config.mode);
  if (!mail) throw new Error("Email transport is disabled");
  console.log("Email worker started");
  while (!stopping) {
    if (!(await mail.runOnce(mail.sender))) await new Promise(resolve => setTimeout(resolve, 500));
  }
} catch {
  console.error("Email worker stopped after a configuration or database error");
  process.exitCode = 1;
} finally { await database.close(); }
