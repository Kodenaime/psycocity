import { createHash, randomBytes } from "node:crypto";
import { Types, type ClientSession } from "mongoose";
import type { IdentityModels } from "./models.js";

export class StaleCredentialsError extends Error {}
export const sessionCookieName = "psycocity_session";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export type Identity = { userId: string; email: string; roles: string[]; verified: boolean; sessionId: string; csrfTokenHash: string; mfaEnabled: boolean; mfaVerified: boolean; isSuperAdmin?: boolean };
export function createIdentityService(models: IdentityModels) {
  async function issueSession(userId: string, options: { session?: ClientSession; mfaVerified?: boolean; mfaVerifiedAt?:Date; expectedCredentialsVersion?: number } = {}) {
    const user = await models.User.findById(userId).session(options.session ?? null).lean();
    if (!user || user.status !== "active") throw new Error("Session account is unavailable");
    if (options.expectedCredentialsVersion !== undefined && options.expectedCredentialsVersion !== (user.credentialsVersion ?? 0)) throw new StaleCredentialsError("Account credentials changed");
    const activeAdmin = user.roles.includes("admin") && user.staffStatus !== "deactivated";
    const mfaRequired = activeAdmin && !options.mfaVerified;
    const credentialsVersion = options.expectedCredentialsVersion ?? user.credentialsVersion ?? 0;
    const token = newToken();
    const csrfToken = newToken();
    const expiresAt = new Date(Date.now() + (mfaRequired ? 5 * 60_000 : 7 * 24 * 60 * 60 * 1000));
    await models.Session.create([{ userId, tokenHash: hashToken(token), csrfTokenHash: hashToken(csrfToken), expiresAt, credentialsVersion, ...(options.mfaVerified ? { mfaVerifiedAt: options.mfaVerifiedAt??new Date() } : {}) }], { session: options.session });
    return { token, csrfToken, expiresAt, mfaRequired, setupRequired: activeAdmin && !user.mfaEnabledAt };
  }
  async function authenticate(token: string | undefined): Promise<Identity | null> {
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    const session = await models.Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() }, revokedAt: null }).select("+csrfTokenHash").lean();
    if (!session) return null;
    const user = await models.User.findById(session.userId).lean();
    if (!user || user.status !== "active" || (session.credentialsVersion ?? 0) !== (user.credentialsVersion ?? 0)) return null;
    const roles = user.roles.filter(role => role !== "admin" || user.staffStatus !== "deactivated");
    return { isSuperAdmin:Boolean(user.isSuperAdmin), userId: String(user._id), email: user.emailNormalized, roles, mfaEnabled: Boolean(user.mfaEnabledAt), mfaVerified: !roles.includes("admin") || Boolean(user.mfaEnabledAt && session.mfaVerifiedAt && session.mfaVerifiedAt.getTime()>Date.now()-7*24*60*60_000), verified: Boolean(user.emailVerifiedAt), sessionId: String(session._id), csrfTokenHash: session.csrfTokenHash };
  }
  async function revokeOwnedSession(actorId: string, sessionId: string) {
    if (!Types.ObjectId.isValid(actorId) || !Types.ObjectId.isValid(sessionId)) return false;
    const result = await models.Session.updateOne({ _id: sessionId, userId: actorId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    return result.modifiedCount === 1;
  }
  return { models, issueSession, authenticate, revokeOwnedSession };
}
export type IdentityService = ReturnType<typeof createIdentityService>;
