// Use a writable project-local browser cache on developer machines and in CI.
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL("../.cache/ms-playwright/", import.meta.url));
if (process.argv[2] === "test" && !process.env.TEST_MONGODB_URI) {
  const name = `psycocity_e2e_${randomUUID().replaceAll("-", "")}_test`;
  process.env.TEST_MONGODB_URI = `mongodb://127.0.0.1:27018/${name}?replicaSet=rs0&directConnection=true`;
  process.env.PSYC_E2E_OWNED_DATABASE = name;
}
await import("@playwright/test/cli");
