import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../apps/api/src/database.js";
import { testMongoUri } from "../../apps/api/src/config.js";
import { createIdentityModels } from "../../apps/api/src/identity/models.js";
import { createIdentityService } from "../../apps/api/src/identity/service.js";
import { readAuthConfig } from "../../apps/api/src/identity/config.js";
import { createMediaModel } from "../../apps/api/src/media/models.js";
import { localPrivateStorage, type PrivateStorage } from "../../apps/api/src/media/storage.js";
import { cleanOrphanedMedia } from "../../apps/api/src/media/cleanup-service.js";
import { createApp } from "../../apps/api/src/app.js";
import { safeErrorHandler } from "../../apps/api/src/errors.js";
import type { Express } from "express";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated _test database required");
const database = createDatabase(uri);
const connection = database.connection.useDb(`media_${randomUUID().replaceAll("-", "")}_test`);
const identity = createIdentityService(createIdentityModels(connection));
const model = createMediaModel(connection);
const origin = "http://localhost:5173";
let directory: string; let storage: PrivateStorage; let app: Express; let image: Buffer;
async function actor() {
  const user = await identity.models.User.create({ emailNormalized: `${randomUUID()}@example.test`, passwordHash: "internal-non-login-fixture", emailVerifiedAt: new Date(), roles: ["applicant"] });
  const session = await identity.issueSession(String(user._id));
  const cookie = `psycocity_session=${session.token}`;
  const headers = { Cookie: cookie, Origin: origin, "X-Requested-With": "Psycocity", "X-CSRF-Token": session.csrfToken };
  const application = await request(app).post("/api/v1/applications").set(headers).send({ track: "academy" });
  expect(application.status).toBe(201);
  await request(app).patch(`/api/v1/applications/${application.body.id}`).set(headers).send({ version: 0, answers: { personal: { legalName: "Sample Applicant", birthDate: "2000-01-01" } } }).expect(200);
  return { headers, cookie, applicationId: application.body.id as string };
}
async function grant(who: Awaited<ReturnType<typeof actor>>, slot = "headshot") {
  const response = await request(app).post("/api/v1/media/uploads").set(who.headers).send({ applicationId: who.applicationId, slot });
  expect(response.status).toBe(201); return response.body as { assetId: string; uploadUrl: string; uploadToken: string };
}
const put = (who: Awaited<ReturnType<typeof actor>>, value: Awaited<ReturnType<typeof grant>>, bytes = image) => request(app).put(value.uploadUrl).set(who.headers).set("X-Upload-Token", value.uploadToken).set("Content-Type", "image/png").send(bytes);
beforeAll(async () => {
  await database.connect(); await mkdir(".cache", { recursive: true }); directory = await mkdtemp(".cache/private-media-"); storage = localPrivateStorage("test", directory);
  app = createApp({ identityService: identity, authConfig: readAuthConfig({ APP_ORIGIN: origin }, "test"), storage }); app.use(safeErrorHandler);
  for (const value of Object.values(connection.models)) await value.createIndexes();
  image = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#e7db9d" } }).png().toBuffer();
});
afterAll(async () => {
  try { if (database.connection.readyState === 1) for (const value of Object.values(connection.models)) await value.collection.drop(); }
  finally { await database.close(); if (directory) await rm(directory, { recursive: true, force: true }); }
});

describe("authorized private application photos", () => {
  it("consumes upload grants once and restricts real previews to the owner", async () => {
    const owner = await actor(); const other = await actor(); const issued = await grant(owner);
    expect((await put(other, issued)).status).toBe(403);
    expect((await put(owner, issued)).status).toBe(200);
    expect((await put(owner, issued)).status).toBe(403);
    const preview = await request(app).get(`/api/v1/media/${issued.assetId}/preview`).set("Cookie", owner.cookie);
    expect(preview.status).toBe(200); expect(preview.headers["content-type"]).toContain("image/webp"); expect(preview.headers["cache-control"]).toBe("private, no-store");
    expect((await sharp(preview.body).metadata()).format).toBe("webp");
    expect((await request(app).get(`/api/v1/media/${issued.assetId}/preview`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/media/${issued.assetId}/preview`).set("Cookie", other.cookie)).status).toBe(404);
  });
  it("rejects expired grants and malformed file contents", async () => {
    const owner = await actor(); const expired = await grant(owner);
    await model.updateOne({ _id: expired.assetId }, { $set: { expiresAt: new Date(0) } });
    expect((await put(owner, expired)).status).toBe(403);
    const bad = await grant(owner);
    expect((await put(owner, bad, Buffer.from("invalid content"))).status).toBe(400);
    expect((await model.findById(bad.assetId).lean())?.status).toBe("rejected");
    const listed = await request(app).get(`/api/v1/media/application/${owner.applicationId}`).set("Cookie", owner.cookie); expect(listed.body.items).toEqual([]);
  });
  it("replaces a required view atomically without changing answer versions", async () => {
    const owner = await actor(); const first = await grant(owner); expect((await put(owner, first)).status).toBe(200);
    const second = await grant(owner); expect((await put(owner, second)).status).toBe(200);
    const listed = await request(app).get(`/api/v1/media/application/${owner.applicationId}`).set("Cookie", owner.cookie);
    expect(listed.body.items).toHaveLength(1); expect(listed.body.items[0].id).toBe(second.assetId);
    expect((await request(app).get(`/api/v1/media/${first.assetId}/preview`).set("Cookie", owner.cookie)).status).toBe(404);
    const application = await request(app).get(`/api/v1/applications/${owner.applicationId}`).set("Cookie", owner.cookie); expect(application.body.version).toBe(1);
    await request(app).post(`/api/v1/media/${second.assetId}/remove`).set(owner.headers).send({}).expect(200);
    expect((await request(app).get(`/api/v1/media/${second.assetId}/preview`).set("Cookie", owner.cookie)).status).toBe(404);
  });
  it("bounds the portfolio to ten active images", async () => {
    const owner = await actor();
    for (let i = 0; i < 10; i++) expect((await put(owner, await grant(owner, "portfolio"))).status).toBe(200);
    expect((await put(owner, await grant(owner, "portfolio"))).status).toBe(409);
    expect(await model.countDocuments({ applicationId: owner.applicationId, slot: "portfolio", active: true })).toBe(10);
  });
  it("cleans inactive assets while retaining active photographs", async () => {
    const owner = await actor(); const replaced = await grant(owner); await put(owner, replaced).expect(200);
    const active = await grant(owner); await put(owner, active).expect(200);
    const inactiveAsset = await model.findById(replaced.assetId).lean();
    const result = await cleanOrphanedMedia(model, storage, new Date(Date.now() + 1000));
    expect(result.failed).toBe(0); expect(result.purged).toBeGreaterThan(0);
    expect((await model.findById(replaced.assetId).lean())?.purgedAt).toBeInstanceOf(Date);
    await expect(storage.read(inactiveAsset!.storageKey, "image")).rejects.toThrow();
    expect((await request(app).get(`/api/v1/media/${active.assetId}/preview`).set("Cookie", owner.cookie)).status).toBe(200);
  });
});
