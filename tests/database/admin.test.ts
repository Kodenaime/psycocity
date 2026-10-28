import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import * as OTPAuth from "otpauth";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../../apps/api/src/database.js";
import { testMongoUri } from "../../apps/api/src/config.js";
import { createIdentityModels } from "../../apps/api/src/identity/models.js";
import { createIdentityService, hashToken, newToken } from "../../apps/api/src/identity/service.js";
import { hashPassword } from "../../apps/api/src/identity/password.js";
import { readAuthConfig } from "../../apps/api/src/identity/config.js";
import { createAuthService } from "../../apps/api/src/identity/auth-service.js";
import { createOutboxModel } from "../../apps/api/src/mail/models.js";
import { createOutbox } from "../../apps/api/src/mail/outbox.js";
import { localMailSender, type Mail } from "../../apps/api/src/mail/delivery.js";
import { createAdminService } from "../../apps/api/src/admin/service.js";
import { createApp } from "../../apps/api/src/app.js";
import { safeErrorHandler } from "../../apps/api/src/errors.js";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated _test database required");
const database = createDatabase(uri); const password = "a unique staff test passphrase"; const origin = "http://localhost:5173";
let encoded: string;
async function context() {
  const connection = database.connection.useDb(`admin_${randomUUID().replaceAll("-", "")}_test`);
  const identity = createIdentityService(createIdentityModels(connection));
  const key = randomBytes(32); const model = createOutboxModel(connection); const outbox = createOutbox(model, key);
  await mkdir(".cache", { recursive: true }); const directory = await mkdtemp(".cache/admin-mail-");
  const sender = localMailSender("test", directory); const mail = { ...outbox, model, sender };
  const service = createAdminService(identity, mail, key, origin);
  const app = createApp({ identityService: identity, mail, adminKey: key, authConfig: readAuthConfig({ APP_ORIGIN: origin }, "test") }); app.use(safeErrorHandler);
  for (const value of Object.values(connection.models)) await value.createIndexes();
  await service.models.Setting.create({ key: "admin-roster", version: 0 });
  return { connection, identity, service, mail, directory, app };
}
let ctx: Awaited<ReturnType<typeof context>>;
async function actor() {
  const email = `${randomUUID()}@example.test`;
  const user = await ctx.identity.models.User.create({ emailNormalized: email, passwordHash: encoded, isSuperAdmin:!await ctx.identity.models.User.exists({isSuperAdmin:true}), roles: ["admin"], staffStatus: "active", emailVerifiedAt: new Date() });
  const pending = await ctx.identity.issueSession(String(user._id)); const before = (await ctx.identity.authenticate(pending.token))!;
  const setup = (await ctx.service.enroll(before))!;
  const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(setup.secret), algorithm: "SHA1", digits: 6, period: 30 }).generate();
  const verified = (await ctx.service.verifyMfa(before, "totp", code))!;
  expect(verified).not.toBeNull();
  const identity = (await ctx.identity.authenticate(verified.session.token))!;
  const headers = { Cookie: `psycocity_session=${verified.session.token}`, Origin: origin, "X-Requested-With": "Psycocity", "X-CSRF-Token": verified.session.csrfToken };
  return { userId: String(user._id), email, identity, headers, codes: verified.recoveryCodes!, seed: setup.secret, code };
}
async function invitation(email: string) {
  while (await ctx.mail.runOnce(ctx.mail.sender)) { /* Deliver only this case's fixture email. */ }
  for (const file of (await readdir(ctx.directory)).filter(value => value.endsWith(".json"))) {
    const mail = JSON.parse(await readFile(`${ctx.directory}/${file}`, "utf8")) as Mail;
    if (mail.to === email && mail.subject.includes("staff invitation")) {
      const token = new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
      if (await ctx.service.models.Invite.exists({ tokenHash: hashToken(token), status: "pending" })) return token;
    }
  }
  throw new Error("Expected pending staff invitation was not delivered locally");
}
beforeAll(async () => { await database.connect(); encoded = await hashPassword(password); });
beforeEach(async () => { ctx = await context(); });
afterEach(async () => {
  try { for (const value of Object.values(ctx.connection.models)) await value.collection.drop(); }
  finally { await rm(ctx.directory, { recursive: true, force: true }); }
});
afterAll(async () => { await database.close(); });

describe("staff security and audit", () => {
  it("bootstraps once, reissues only the original pending email and consumes invitations once", async () => {
    const email = "initial-staff@example.test";
    await ctx.service.bootstrap(email); const oldToken = await invitation(email);
    await expect(ctx.service.bootstrap("other@example.test")).rejects.toThrow("Bootstrap already issued");
    await ctx.service.bootstrap(email, true); const token = await invitation(email);
    expect(token).not.toBe(oldToken); expect(await ctx.service.activate(oldToken, password)).toBeNull();
    const session = await ctx.service.activate(token, password); expect(session?.mfaRequired).toBe(true);
    expect(await ctx.service.activate(token, password)).toBeNull();
    await expect(ctx.service.bootstrap(email, true)).rejects.toThrow("already complete");
    const response = await request(ctx.app).get("/api/v1/admin/overview").set("Cookie", `psycocity_session=${session!.token}`);
    expect(response.status).toBe(403); expect(response.body.error.code).toBe("MFA_REQUIRED");
  });
  it("enforces actual MFA, encrypts secrets and keeps them out of staff/audit projections", async () => {
    const admin = await actor();
    expect(admin.codes).toHaveLength(10); expect(admin.identity.mfaVerified).toBe(true);
    const stored = await ctx.identity.models.User.findById(admin.userId).select("+mfaSecretEncrypted +mfaRecoveryHashes").lean();
    expect(stored?.mfaSecretEncrypted).not.toContain(admin.seed); expect(stored?.mfaRecoveryHashes).not.toContain(admin.codes[0]);
    expect(await ctx.identity.authenticate((await ctx.identity.issueSession(admin.userId)).token)).toMatchObject({ mfaVerified: false });
    const staff = await request(ctx.app).get("/api/v1/admin/staff").set(admin.headers); expect(staff.status).toBe(200);
    const audit = await request(ctx.app).get("/api/v1/admin/audit").set(admin.headers); expect(audit.status).toBe(200);
    expect(audit.body.items.some((item: { action: string }) => item.action === "staff.mfa_enrolled")).toBe(true);
    expect(audit.body.items[0].actorLabel).toBe(admin.email);
    expect(staff.text + audit.text).not.toContain(admin.seed); expect(staff.text + audit.text).not.toContain(admin.codes[0]); expect(staff.text).not.toContain("Encrypted");
  });
  it("rejects TOTP replay and permits each recovery code once", async () => {
    const admin = await actor();
    const auth = createAuthService(ctx.identity, ctx.mail, origin);
    const pending = (await auth.login(admin.email, password))!; const pendingActor = (await ctx.identity.authenticate(pending.token))!;
    expect(await ctx.service.verifyMfa(pendingActor, "totp", admin.code)).toBeNull();
    const recovered = await ctx.service.verifyMfa(pendingActor, "recovery", admin.codes[0]!); expect(recovered?.session.mfaRequired).toBe(false); expect(recovered?.recoveryCodes).toBeUndefined();
    const again = (await auth.login(admin.email, password))!; const nextActor = (await ctx.identity.authenticate(again.token))!;
    expect(await ctx.service.verifyMfa(nextActor, "recovery", admin.codes[0]!)).toBeNull();
  });
  it("requires an existing account password for role activation without overwriting it", async () => {
    const admin = await actor(); const email = "existing-applicant@example.test";
    const user = await ctx.identity.models.User.create({ emailNormalized: email, passwordHash: encoded, roles: ["applicant"], emailVerifiedAt: new Date() });
    const prior = await ctx.identity.issueSession(String(user._id));
    await ctx.service.inviteStaff(admin.identity, email); const token = await invitation(email);
    expect(await ctx.service.activate(token, "incorrect but long password")).toBeNull();
    expect((await ctx.service.activate(token, password))?.mfaRequired).toBe(true);
    const updated = await ctx.identity.models.User.findById(user._id).select("+passwordHash").lean(); expect(updated?.passwordHash).toBe(encoded); expect(updated?.roles).toEqual(expect.arrayContaining(["applicant", "admin"]));
    expect(await ctx.identity.authenticate(prior.token)).toBeNull();
  });
  it("protects the last secured administrator, even when another staff member has not enrolled", async () => {
    const admin = await actor();
    await ctx.identity.models.User.create({ emailNormalized: "pending-staff@example.test", passwordHash: encoded, roles: ["admin"], emailVerifiedAt: new Date() });
    await expect(ctx.service.deactivate(admin.identity, admin.userId)).rejects.toThrow("super admin");
    const other = await actor(); await ctx.service.deactivate(admin.identity, other.userId);
    expect((await request(ctx.app).get("/api/v1/admin/overview").set(other.headers)).status).toBe(401);
    const auth = createAuthService(ctx.identity, ctx.mail, origin); const login = (await auth.login(other.email, password))!;
    const denied = await request(ctx.app).get("/api/v1/admin/overview").set("Cookie", `psycocity_session=${login.token}`); expect(denied.status).toBe(403);
  });
  it("serializes simultaneous roster changes so two administrators cannot remove each other", async () => {
    const first = await actor(); const second = await actor();
    const outcomes = await Promise.allSettled([ctx.service.deactivate(first.identity, second.userId), ctx.service.deactivate(second.identity, first.userId)]);
    expect(outcomes.filter(value => value.status === "fulfilled")).toHaveLength(1);
    expect(await ctx.identity.models.User.countDocuments({ roles: "admin", status: "active", staffStatus: { $ne: "deactivated" }, mfaEnabledAt: { $ne: null } })).toBe(1);
  });
  it("requires recent staff verification and rejects late sessions bound to old credentials", async () => {
    const admin = await actor(); await ctx.identity.models.Session.updateOne({ _id: admin.identity.sessionId }, { $set: { mfaVerifiedAt: new Date(Date.now() - 16 * 60_000) } });
    await expect(ctx.service.inviteStaff(admin.identity, "next@example.test")).rejects.toThrow("Verify staff security again");
    await ctx.identity.models.User.updateOne({ _id: admin.userId }, { $inc: { credentialsVersion: 1 } });
    await expect(ctx.identity.issueSession(admin.userId, { expectedCredentialsVersion: 0 })).rejects.toThrow("credentials changed");
    const late = newToken();
    await ctx.identity.models.Session.create({ userId: admin.userId, tokenHash: hashToken(late), csrfTokenHash: hashToken(newToken()), credentialsVersion: 0, expiresAt: new Date(Date.now() + 60_000), mfaVerifiedAt: new Date() });
    expect(await ctx.identity.authenticate(late)).toBeNull();
  });
});
it("only the bootstrap identity is super admin and legacy promotion preserves that identity",async()=>{
 const email="first-owner@example.test";await ctx.service.bootstrap(email);const pending=(await ctx.service.activate(await invitation(email),password))!;const before=(await ctx.identity.authenticate(pending.token))!;const setup=(await ctx.service.enroll(before))!;const verified=(await ctx.service.verifyMfa(before,"totp",new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(setup.secret),algorithm:"SHA1",digits:6,period:30}).generate()))!;const primary=(await ctx.identity.authenticate(verified.session.token))!;expect(primary.isSuperAdmin).toBe(true);await ctx.service.inviteStaff(primary,"normal-admin@example.test");const next=(await ctx.service.activate(await invitation("normal-admin@example.test"),password))!;const ordinary=(await ctx.identity.authenticate(next.token))!;expect(ordinary.isSuperAdmin).toBe(false);
 await ctx.identity.models.User.updateOne({_id:primary.userId},{$unset:{isSuperAdmin:1}});const {migrateFirstSuperAdmin}=await import("../../apps/api/src/admin/super-admin.js");await migrateFirstSuperAdmin(ctx.connection);await migrateFirstSuperAdmin(ctx.connection);expect(await ctx.identity.models.User.countDocuments({isSuperAdmin:true})).toBe(1);expect((await ctx.identity.models.User.findById(primary.userId).lean())?.isSuperAdmin).toBe(true);
});
it("ordinary admins retain operational access but cannot invite, revoke invitations or remove admins",async()=>{
 const primary=await actor();const ordinary=await actor();expect((await request(ctx.app).get("/api/v1/admin/overview").set(ordinary.headers)).status).toBe(200);await expect(ctx.service.inviteStaff(ordinary.identity,"not-allowed@example.test")).rejects.toThrow("super admin");await expect(ctx.service.deactivate(ordinary.identity,primary.userId)).rejects.toThrow("super admin");await ctx.service.inviteStaff(primary.identity,"pending-role@example.test");const invite=(await ctx.service.models.Invite.findOne({email:"pending-role@example.test"}).lean())!;await expect(ctx.service.revokeInvite(ordinary.identity,String(invite._id))).rejects.toThrow("super admin");
});
it("trusts MFA only for the same account/browser for seven days, preserves step-up and supports forgetting",async()=>{
 const who=await actor();const device=(await ctx.identity.models.TrustedDevice.findOne({userId:who.userId}).lean())!;expect(device).toBeTruthy();
 // Issue another opaque proof in a real transaction; raw proof is only held by this test/browser.
 const {createTrustedDevices}=await import("../../apps/api/src/identity/trusted-device.js");const proof=(await ctx.connection.transaction(session=>createTrustedDevices(ctx.identity).issue(who.userId,session)))!;const auth=createAuthService(ctx.identity,ctx.mail,origin);expect((await auth.login(who.email,password))?.mfaRequired).toBe(true);const trusted=(await auth.login(who.email,password,proof.token))!;expect(trusted.mfaRequired).toBe(false);expect((await ctx.identity.authenticate(trusted.token))?.mfaVerified).toBe(true);expect(await auth.login(who.email,"wrong password",proof.token)).toBeNull();const other=await actor();expect((await auth.login(other.email,password,proof.token))?.mfaRequired).toBe(true);
 await ctx.identity.models.TrustedDevice.updateOne({tokenHash:hashToken(proof.token)},{$set:{mfaVerifiedAt:new Date(Date.now()-20*60_000)}});const oldTrusted=(await auth.login(who.email,password,proof.token))!;const oldActor=(await ctx.identity.authenticate(oldTrusted.token))!;await expect(ctx.service.inviteStaff(oldActor,"fresh-code-required@example.test")).rejects.toThrow("Verify staff security");
 await ctx.identity.models.TrustedDevice.updateOne({tokenHash:hashToken(proof.token)},{$set:{expiresAt:new Date(Date.now()-1)}});expect((await auth.login(who.email,password,proof.token))?.mfaRequired).toBe(true);
 const newProof=(await ctx.connection.transaction(session=>createTrustedDevices(ctx.identity).issue(who.userId,session)))!;await request(ctx.app).post("/api/v1/admin/mfa/forget-device").set({...who.headers,Cookie:`${who.headers.Cookie}; psycocity_staff_device=${newProof.token}`}).send({}).expect(200);expect((await auth.login(who.email,password,newProof.token))?.mfaRequired).toBe(true);
});
