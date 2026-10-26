import { mongo } from "mongoose";
import { parsePort } from "./port.js";

export const developmentMongoUri = "mongodb://127.0.0.1:27017/psycocity?replicaSet=rs0&directConnection=true";
export const testMongoUri = "mongodb://127.0.0.1:27018/psycocity_test?replicaSet=rs0&directConnection=true";

export function readConfig(env: Record<string, string | undefined>) {
  const mode = env.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(mode)) {
    throw new Error("NODE_ENV must be development, test or production");
  }
  const port = parsePort(env.PORT);
  const mongoUri = env.MONGODB_URI ?? (mode === "development" ? developmentMongoUri : undefined);
  // Never include a supplied value or parser error in configuration diagnostics.
  if (!mongoUri || !/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]+(?:\?|$)/.test(mongoUri)) {
    throw new Error("MONGODB_URI must be a valid MongoDB URI with an explicit database name");
  }
  try {
    const client = new mongo.MongoClient(mongoUri);
    if (["admin", "local", "config"].includes(client.options.dbName)) throw new Error("Reserved database");
  } catch {
    throw new Error("MONGODB_URI must be a valid MongoDB URI with a non-system database name");
  }
  return { mode, port, mongoUri };
}
