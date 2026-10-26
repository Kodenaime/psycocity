import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../../apps/api/src/database.js";
import { testMongoUri } from "../../apps/api/src/config.js";
import { createIdentityModels, ensureIdentityIndexes } from "../../apps/api/src/identity/models.js";
import { createIdentityService, hashToken } from "../../apps/api/src/identity/service.js";
import { requireIdentity, requireRoles } from "../../apps/api/src/identity/middleware.js";
import { createApp } from "../../apps/api/src/app.js";
import { hashPassword } from "../../apps/api/src/identity/password.js";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("A dedicated _test database is required");
const db = createDatabase(uri);
const models = createIdentityModels(db.connection);
const service = createIdentityService(models);
const prefix = randomUUID();
let userId: string;
let otherId: string;
const userIds: string[] = [];
let passwordHash: string;
async function makeUser(name: string, username?: string) {
  const user = await models.User.create({ emailNormalized: `${prefix}-${name}@example.test`, usernameNormalized: username, passwordHash, roles: ["applicant"] });
  userIds.push(String(user._id));
  return String(user._id);
}
beforeAll(async () => {
  await db.connect();
  await ensureIdentityIndexes(models);
  await ensureIdentityIndexes(models);
  passwordHash = await hashPassword("actual-password-for-test-only");
  userId = await makeUser("owner");
  otherId = await makeUser("other");
});
afterAll(async () => {
  try {
    if (db.connection.readyState === 1) {
      await models.Session.deleteMany({ userId: { $in: userIds } });
      await models.AuthToken.deleteMany({ userId: { $in: userIds } });
      await models.User.deleteMany({ _id: { $in: userIds } });
    }
  } finally { await db.close(); }
});

describe("persistent identities and actual authorization", () => {
  it("enforces normalized unique email with real indexes", async () => {
    await expect(models.User.create({ emailNormalized: ` ${prefix.toUpperCase()}-OWNER@EXAMPLE.TEST `, passwordHash })).rejects.toMatchObject({ code: 11000 });
    expect((await models.User.findById(userId).lean())?.passwordHash).toBeUndefined();
  });
  it("allows absent usernames but enforces uniqueness when supplied", async () => {
    await makeUser("named", `${prefix}-name`);
    await expect(makeUser("duplicate-name", `${prefix}-name`)).rejects.toMatchObject({ code: 11000 });
  });
  it("persists only hashed opaque session credentials and serves safe current-user data", async () => {
    const issued = await service.issueSession(userId);
    const stored = await models.Session.findOne({ userId, tokenHash: hashToken(issued.token) }).select("+tokenHash +csrfTokenHash").lean();
    expect(stored?.tokenHash).not.toBe(issued.token);
    expect(stored?.csrfTokenHash).toBe(hashToken(issued.csrfToken));
    const response = await request(createApp({ identityService: service })).get("/api/v1/auth/me").set("Cookie", `psycocity_session=${issued.token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: { id: userId, email: `${prefix}-owner@example.test`, roles: ["applicant"], verified: false } });
    expect(response.text).not.toContain("passwordHash");
    expect(response.text).not.toContain(issued.token);
  });
  it("rejects missing sessions and applicant access to staff actions", async () => {
    const app = express();
    app.get("/staff", requireIdentity(service), requireRoles("admin"), (_req, res) => res.json({ allowed: true }));
    expect((await request(app).get("/staff")).status).toBe(401);
    const issued = await service.issueSession(userId);
    expect((await request(app).get("/staff").set("Cookie", `psycocity_session=${issued.token}`)).status).toBe(403);
  });
  it("allows only the owner to revoke a session and rejects it thereafter", async () => {
    const issued = await service.issueSession(userId);
    const identity = await service.authenticate(issued.token);
    expect(identity).not.toBeNull();
    expect(await service.revokeOwnedSession(otherId, identity!.sessionId)).toBe(false);
    expect(await service.authenticate(issued.token)).not.toBeNull();
    expect(await service.revokeOwnedSession(userId, identity!.sessionId)).toBe(true);
    expect(await service.authenticate(issued.token)).toBeNull();
  });
  it("enforces expiration even before TTL cleanup and suspended-account denial", async () => {
    const issued = await service.issueSession(userId);
    await models.Session.updateOne({ tokenHash: hashToken(issued.token) }, { $set: { expiresAt: new Date(0) } });
    expect(await service.authenticate(issued.token)).toBeNull();
    const otherSession = await service.issueSession(otherId);
    await models.User.updateOne({ _id: otherId }, { $set: { status: "suspended" } });
    expect(await service.authenticate(otherSession.token)).toBeNull();
  });
  it("stores purpose-bound expiring auth tokens with uniqueness", async () => {
    const tokenHash = hashToken(randomUUID());
    await models.AuthToken.create({ userId, purpose: "password_reset", tokenHash, expiresAt: new Date(Date.now() + 60_000) });
    await expect(models.AuthToken.create({ userId, purpose: "email_verification", tokenHash, expiresAt: new Date(Date.now() + 60_000) })).rejects.toMatchObject({ code: 11000 });
  });
});
