import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../apps/api/src/database.js";
import { readConfig, testMongoUri } from "../../apps/api/src/config.js";
import { createApp } from "../../apps/api/src/app.js";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
readConfig({ NODE_ENV: "test", MONGODB_URI: uri });
// Restrict cleanup to a named test database and this suite's own collection.
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) {
  throw new Error("TEST_MONGODB_URI must name a dedicated database ending in _test");
}
const database = createDatabase(uri);
const collectionName = `b03_${randomUUID().replaceAll("-", "")}`;

beforeAll(async () => {
  await database.connect();
  await database.connection.db!.createCollection(collectionName);
});
afterAll(async () => {
  try {
    if (database.connection.readyState === 1) await database.connection.db!.dropCollection(collectionName);
  } finally { await database.close(); }
});

describe("actual MongoDB replica set", () => {
  it("has writable replica-set topology, responds to ping, and reports ready", async () => {
    const hello = await database.connection.db!.admin().command({ hello: 1 });
    expect(hello.setName).toBe("rs0");
    expect(hello.isWritablePrimary).toBe(true);
    expect((await database.connection.db!.admin().command({ ping: 1 })).ok).toBe(1);
    expect(await database.isReady()).toBe(true);
  });
  it("commits multiple writes atomically", async () => {
    const session = await database.connection.startSession();
    const collection = database.connection.collection(collectionName);
    try {
      await session.withTransaction(async () => {
        await collection.insertOne({ purpose: "committed-first" }, { session });
        await collection.insertOne({ purpose: "committed-second" }, { session });
      });
      expect(await collection.countDocuments({ purpose: /^committed-/ })).toBe(2);
    } finally { await session.endSession(); }
  });
  it("rolls back all writes when a transaction fails", async () => {
    const session = await database.connection.startSession();
    const collection = database.connection.collection(collectionName);
    try {
      await expect(session.withTransaction(async () => {
        await collection.insertOne({ purpose: "rolled-back" }, { session });
        throw new Error("Intentional rollback");
      })).rejects.toThrow("Intentional rollback");
      expect(await collection.countDocuments({ purpose: "rolled-back" })).toBe(0);
    } finally { await session.endSession(); }
  });
  it("turns readiness off after database disconnection without breaking liveness", async () => {
    const isolated = createDatabase(uri);
    const app = createApp({ isDatabaseReady: isolated.isReady });
    try {
      await isolated.connect();
      expect((await request(app).get("/api/v1/ready")).status).toBe(200);
      await isolated.close();
      const response = await request(app).get("/api/v1/ready");
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: "not_ready" });
      expect((await request(app).get("/api/v1/health")).status).toBe(200);
    } finally { await isolated.close(); }
  });
  it("fails safely when a MongoDB service is unreachable", async () => {
    const unavailable = createDatabase("mongodb://127.0.0.1:1/unavailable_test?replicaSet=rs0&directConnection=true");
    try {
      await expect(unavailable.connect()).rejects.toThrow("MongoDB unavailable or not a writable replica set");
      expect(await unavailable.isReady()).toBe(false);
    } finally { await unavailable.close(); }
  });
});
