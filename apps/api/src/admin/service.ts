import { createTrustedDevices } from "../identity/trusted-device.js";
import { randomBytes, hkdfSync } from "node:crypto";
import * as OTPAuth from "otpauth";
import { z } from "@psycocity/validation";
import type { ClientSession, Types } from "mongoose";
import { encryptPayload, decryptPayload } from "../mail/crypto.js";
import { hashToken, newToken, type Identity, type IdentityService } from "../identity/service.js";
import { hashPassword, verifyPassword } from "../identity/password.js";
import type { MailRuntime } from "../identity/auth-service.js";
import { createAdminModels } from "./models.js";

export class AdminActionError extends Error { constructor(message: string, public code: "CONFLICT" | "MFA_REQUIRED" | "FORBIDDEN" = "CONFLICT") { super(message); } }
export function createAdminService(identity: IdentityService, mail: MailRuntime, masterKey: Buffer, origin: string) {
  if (masterKey.length !== 32) throw new Error("Staff encryption requires a 32-byte master key");
  const { User, Session } = identity.models;
  const { Invite, Setting, Audit } = createAdminModels(User.db);
  const key = Buffer.from(hkdfSync("sha256", masterKey, Buffer.alloc(0), "psycocity-admin-mfa-v1", 32));
  const secretSchema = z.object({ userId: z.string(), secret: z.string().regex(/^[A-Z2-7]+$/) });
  const activeAdmin = { roles: "admin" as const, status: "active" as const, staffStatus: { $ne: "deactivated" as const } };
  async function rosterLock(session: ClientSession) { await Setting.updateOne({ key: "admin-roster" }, { $inc: { version: 1 } }, { upsert: true, session }); }
  async function audit(actorId: string | null, action: string, entityId: string | Types.ObjectId, session: ClientSession) { await Audit.create([{ actorId: actorId ?? undefined, action, entityId }], { session }); }
  async function authorize(actor: Identity, session: ClientSession, recent = true) {
    if (!(await User.exists({ _id: actor.userId, ...activeAdmin, mfaEnabledAt: { $ne: null } }).session(session)) || !(await Session.findOneAndUpdate({ _id: actor.sessionId, userId: actor.userId, revokedAt: null, expiresAt: { $gt: new Date() }, mfaVerifiedAt: { $gt: new Date(recent ? Date.now() - 15 * 60_000 : Date.now()-7*24*60*60_000) } }, { $set: { lastUsedAt: new Date() } }, { session, returnDocument: "after" }))) throw new AdminActionError("Verify staff security again before changing access", "MFA_REQUIRED");
  }
  async function authorizeSuper(actor:Identity,session:ClientSession){await authorize(actor,session);if(!await User.exists({_id:actor.userId,...activeAdmin,isSuperAdmin:true}).session(session))throw new AdminActionError("Only the original super admin can invite or remove administrators","FORBIDDEN");}
  async function issueInvite(email: string, actorId: string | null, source: "bootstrap" | "staff", session: ClientSession) {
    if (!mail) throw new AdminActionError("Staff email is not configured");
    if (await User.exists({ emailNormalized: email, ...activeAdmin }).session(session)) throw new AdminActionError("This account already has active staff access");
    await Invite.updateMany({ email, status: "pending" }, { $set: { status: "revoked" } }, { session });
    const token = newToken();
    const [invite] = await Invite.create([{ email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 48 * 60 * 60_000), issuedBy: actorId ?? undefined, source }], { session });
    const url = new URL("/admin/activate", origin); url.searchParams.set("token", token);
    await mail.enqueue({ to: email, subject: "Your Psycocity staff invitation", text: `You have been invited to Psycocity staff administration. Staff have operational access; only the original super admin manages staff invitations and removal.\n\nActivate using your private, single-use link within 48 hours:\n${url.href}\n\nFor an existing account, enter its current password; this link cannot reset it. New accounts choose a strong password. Authenticator MFA is mandatory before staff access.` }, `staff-invitation:${invite!._id}`, session);
    await audit(actorId, source === "bootstrap" ? "staff.bootstrap_invited" : "staff.invited", invite!._id, session);
  }
  async function bootstrap(email: string, reissue = false) {
    await User.db.transaction(async session => {
      await rosterLock(session);
      if (await User.exists({ roles: "admin" }).session(session)) throw new AdminActionError("Initial staff setup is already complete");
      const setting = await Setting.findOne({ key: "admin-bootstrap" }).session(session);
      if (setting && (!reissue || setting.value?.emailHash !== hashToken(email))) throw new AdminActionError("Bootstrap already issued; only its original pending email can be reissued");
      if (!setting) await Setting.create([{ key: "admin-bootstrap", value: { emailHash: hashToken(email) } }], { session });
      await issueInvite(email, null, "bootstrap", session);
    });
  }
  async function inviteStaff(actor: Identity, email: string) {
    await User.db.transaction(async session => { await rosterLock(session); await authorizeSuper(actor, session); await issueInvite(email, actor.userId, "staff", session); });
  }
  async function activate(token: string, password: string) {
    const invitation = await Invite.findOne({ tokenHash: hashToken(token), status: "pending", expiresAt: { $gt: new Date() } }).lean();
    if (!invitation) return null;
    const existing = await User.findOne({ emailNormalized: invitation.email }).select("+passwordHash").lean();
    if (existing && (existing.status !== "active" || !(await verifyPassword(existing.passwordHash, password)))) return null;
    const encoded = existing ? undefined : await hashPassword(password);
    return User.db.transaction(async session => {
      await rosterLock(session);
      const current = await Invite.findOneAndUpdate({ _id: invitation._id, status: "pending", expiresAt: { $gt: new Date() } }, { $set: { status: "used", usedAt: new Date() } }, { session, returnDocument: "after" });
      if (!current) return null;
      let user = await User.findOne({ emailNormalized: current.email }).select("+passwordHash").session(session);
      if (user) {
        if (!existing || user.passwordHash !== existing.passwordHash || user.status !== "active") throw new AdminActionError("Invitation or account credentials changed; try again");
        await User.updateOne({ _id: user._id }, { $addToSet: { roles: "admin" }, $set: { staffStatus: "active", ...(current.source === "bootstrap" ? {isSuperAdmin:true} : {}), emailVerifiedAt: user.emailVerifiedAt ?? new Date() } }, { session });
      } else {
        const created = await User.create([{ emailNormalized: current.email, passwordHash: encoded!, roles: ["admin"], isSuperAdmin:current.source==="bootstrap", staffStatus: "active", emailVerifiedAt: new Date() }], { session }); user = created[0]!;
      }
      await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
      await audit(String(user._id), "staff.invitation_accepted", current._id, session);
      return identity.issueSession(String(user._id), { session });
    });
  }
  async function enroll(actor: Identity) {
    const user = await User.findOne({ _id: actor.userId, ...activeAdmin }).lean();
    if (!user || user.mfaEnabledAt) return null;
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    const totp = new OTPAuth.TOTP({ issuer: "Psycocity", label: user.emailNormalized, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
    await User.updateOne({ _id: user._id, mfaEnabledAt: null }, { $set: { pendingMfaSecretEncrypted: encryptPayload({ userId: actor.userId, secret }, key), pendingMfaExpiresAt: new Date(Date.now() + 10 * 60_000) } });
    return { secret, uri: totp.toString() };
  }
  async function verifyMfa(actor: Identity, method: "totp" | "recovery", code: string) {
    return User.db.transaction(async session => {
      const user = await User.findOne({ _id: actor.userId, ...activeAdmin }).select("+mfaSecretEncrypted +pendingMfaSecretEncrypted +pendingMfaExpiresAt +lastTotpCounter +mfaRecoveryHashes").session(session);
      const currentSession = await Session.findOne({ _id: actor.sessionId, userId: actor.userId, revokedAt: null, expiresAt: { $gt: new Date() } }).session(session);
      if (!user || !currentSession || currentSession.credentialsVersion !== user.credentialsVersion) return null;
      let recoveryCodes: string[] | undefined;
      if (method === "recovery") {
        const normalized = code.replace(/[-\s]/g, "").toLowerCase();
        if (!user.mfaEnabledAt || !/^[0-9a-f]{20}$/.test(normalized)) return null;
        const updated = await User.updateOne({ _id: user._id, mfaRecoveryHashes: hashToken(normalized) }, { $pull: { mfaRecoveryHashes: hashToken(normalized) } }, { session });
        if (updated.modifiedCount !== 1) return null;
      } else {
        if (!/^\d{6}$/.test(code)) return null;
        const encrypted = user.mfaEnabledAt ? user.mfaSecretEncrypted : user.pendingMfaSecretEncrypted;
        if (!encrypted || (!user.mfaEnabledAt && (!user.pendingMfaExpiresAt || user.pendingMfaExpiresAt <= new Date()))) return null;
        const value = secretSchema.parse(decryptPayload(encrypted, key)); if (value.userId !== actor.userId) return null;
        const now = Date.now(); const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(value.secret), algorithm: "SHA1", digits: 6, period: 30 });
        const delta = totp.validate({ token: code, timestamp: now, window: 1 });
        if (delta === null) return null;
        const counter = Math.floor(now / 30_000) + delta;
        if (counter <= (user.lastTotpCounter ?? -1)) return null;
        if (!user.mfaEnabledAt) recoveryCodes = Array.from({ length: 10 }, () => randomBytes(10).toString("hex"));
        const updated = await User.updateOne({ _id: user._id, $or: [{ lastTotpCounter: { $lt: counter } }, { lastTotpCounter: null }] }, { $set: { lastTotpCounter: counter, ...(recoveryCodes ? { mfaEnabledAt: new Date(), mfaSecretEncrypted: encrypted, mfaRecoveryHashes: recoveryCodes.map(hashToken) } : {}) }, $unset: { pendingMfaSecretEncrypted: 1, pendingMfaExpiresAt: 1 } }, { session });
        if (updated.modifiedCount !== 1) return null;
      }
      await Session.updateOne({ _id: currentSession._id }, { $set: { revokedAt: new Date() } }, { session });
      const next = await identity.issueSession(actor.userId, { session, mfaVerified: true });
      await audit(actor.userId, recoveryCodes ? "staff.mfa_enrolled" : method === "recovery" ? "staff.recovery_used" : "staff.mfa_verified", user._id, session);
      const device=await createTrustedDevices(identity).issue(actor.userId,session);
      return { session: next, recoveryCodes, device };
    });
  }
  async function deactivate(actor: Identity, targetId: string) {
    await User.db.transaction(async session => {
      await rosterLock(session); await authorizeSuper(actor, session);
      const target = await User.findOne({ _id: targetId, roles: "admin" }).session(session);
      if (!target) throw new AdminActionError("Staff account not found");
      if(target.isSuperAdmin||String(target._id)===actor.userId)throw new AdminActionError("The original super admin cannot be removed through staff management");
      if (target.staffStatus === "deactivated") return;
      if (target.status === "active" && target.mfaEnabledAt && await User.countDocuments({ ...activeAdmin, mfaEnabledAt: { $ne: null } }).session(session) <= 1) throw new AdminActionError("At least one active administrator with completed MFA must remain");
      await User.updateOne({ _id: target._id }, { $set: { staffStatus: "deactivated" } }, { session });
      await identity.models.TrustedDevice.updateMany({userId:target._id,revokedAt:null},{$set:{revokedAt:new Date()}},{session});
      await Session.updateMany({ userId: target._id, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
      await audit(actor.userId, "staff.deactivated", target._id, session);
    });
  }
  async function revokeInvite(actor: Identity, id: string) {
    await User.db.transaction(async session => { await authorizeSuper(actor, session); const value = await Invite.findOneAndUpdate({ _id: id, status: "pending" }, { $set: { status: "revoked" } }, { session, returnDocument: "after" }); if (value) await audit(actor.userId, "staff.invitation_revoked", value._id, session); });
  }
  return { authorize, bootstrap, inviteStaff, activate, enroll, verifyMfa, deactivate, revokeInvite, models: { Invite, Setting, Audit } };
}
