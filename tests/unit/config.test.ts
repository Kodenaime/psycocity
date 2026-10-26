import { describe, expect, it } from "vitest";
import { developmentMongoUri, readConfig } from "../../apps/api/src/config.js";

describe("API configuration", () => {
  it("provides development-only local defaults", () => {
    expect(readConfig({})).toEqual({ mode: "development", port: 3001, mongoUri: developmentMongoUri });
  });
  it("accepts explicit production settings", () => {
    const mongoUri = "mongodb://127.0.0.1:27017/production_example?replicaSet=rs0";
    expect(readConfig({ NODE_ENV: "production", PORT: "4000", MONGODB_URI: mongoUri })).toEqual({ mode: "production", port: 4000, mongoUri });
  });
  it.each(["production", "test"])("requires an explicit database in %s mode", (mode) => {
    expect(() => readConfig({ NODE_ENV: mode })).toThrow("MONGODB_URI");
  });
  it("rejects unknown environment modes", () => {
    expect(() => readConfig({ NODE_ENV: "staging-typo" })).toThrow("NODE_ENV");
  });
  it.each(["", "https://example.com/database", "mongodb://localhost:27017", "mongodb://localhost:27017/admin", "mongodb://localhost:27017/local", "mongodb://localhost:27017/config"])("rejects invalid or system database setting %j", (uri) => {
    expect(() => readConfig({ MONGODB_URI: uri })).toThrow("MONGODB_URI");
  });
  it("does not include credentials in invalid URI diagnostics", () => {
    const secret = "do-not-print-this";
    expect(() => readConfig({ MONGODB_URI: `mongodb://user:${secret}@invalid:wrong-port/private` })).toThrow("MONGODB_URI");
    try { readConfig({ MONGODB_URI: `mongodb://user:${secret}@invalid:wrong-port/private` }); }
    catch (error) { expect(String(error)).not.toContain(secret); }
  });
});
