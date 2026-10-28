import type { IdentityService } from "./service.js";
import { hashToken, newToken, StaleCredentialsError } from "./service.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { createMailRuntime } from "../mail/runtime.js";
export type MailRuntime = Awaited<ReturnType<typeof createMailRuntime>>;
export function createAuthService(identity: IdentityService, mail: MailRuntime, origin: string) {
  const { User, AuthToken, Session } = identity.models;
  let dummyHash: Promise<string> | undefined;
  async function issueToken(userId: string, email: string, purpose: "email_verification" | "password_reset", session: import("mongoose").ClientSession) {
    if (!mail) throw new Error("Email unavailable");
    const token = newToken();
    const older = await AuthToken.find({userId,purpose,consumedAt:null}).select("_id").session(session).lean();
    if (older.length) await mail.model.updateMany({dedupeKey:{$in:older.map(record=>`${purpose}:${record._id}`)},state:{$ne:"delivered"}},{$set:{state:"failed",lastErrorCode:"TOKEN_SUPERSEDED"},$unset:{encryptedPayload:1,claimId:1,leaseUntil:1}},{session});
    await AuthToken.deleteMany({ userId, purpose, consumedAt: null }).session(session);
    const [record] = await AuthToken.create([{ userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + (purpose === "email_verification" ? 24 : 1) * 60 * 60 * 1000) }], { session });
    const path = purpose === "email_verification" ? "/applicant/verify-email" : "/applicant/reset-password";
    const url = new URL(path, origin); url.searchParams.set("token", token);
    await mail.enqueue({ to: email, subject: purpose === "email_verification" ? "Verify your Psycocity email" : "Reset your Psycocity password", text: `${purpose === "email_verification" ? "Confirm your email address" : "Choose a new password"} using this private link:
${url.href}

If you did not request this, you can ignore this email. This link expires and can be used only once.` }, `${purpose}:${record!._id}`, session, record!.expiresAt);
  }
  async function register(email: string, password: string) {
    const passwordHash = await hashPassword(password);
    if (await User.exists({ emailNormalized: email })) return;
    try {
      await User.db.transaction(async session => {
        const [user] = await User.create([{ emailNormalized: email, passwordHash, roles: ["applicant"] }], { session });
        await issueToken(String(user!._id), email, "email_verification", session);
      });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== 11000) throw error;
    }
  }
  async function requestToken(email: string, purpose: "email_verification" | "password_reset") {
    const user = await User.findOne({ emailNormalized: email, status: "active" }).lean();
    if (!user || (purpose === "email_verification" && user.emailVerifiedAt)) return;
    await User.db.transaction(async session => { await issueToken(String(user._id), email, purpose, session); });
  }
  async function verifyEmail(token: string): Promise<boolean> {
    return User.db.transaction(async session => {
      const record = await AuthToken.findOneAndUpdate({ tokenHash: hashToken(token), purpose: "email_verification", consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { session, returnDocument: "after" });
      if (!record) return false;
      await User.updateOne({ _id: record.userId }, { $set: { emailVerifiedAt: new Date() } }, { session });
      return true;
    });
  }
  async function resetPassword(token: string, password: string): Promise<boolean> {
    if (!(await AuthToken.exists({ tokenHash: hashToken(token), purpose: "password_reset", consumedAt: null, expiresAt: { $gt: new Date() } }))) return false;
    const passwordHash = await hashPassword(password);
    return User.db.transaction(async session => {
      const record = await AuthToken.findOneAndUpdate({ tokenHash: hashToken(token), purpose: "password_reset", consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { session, returnDocument: "after" });
      if (!record) return false;
      await User.updateOne({ _id: record.userId }, { $set: { passwordHash }, $inc: { credentialsVersion: 1 } }, { session });
      await Session.updateMany({ userId: record.userId, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
      return true;
    });
  }
  async function login(identifier: string, password: string) {
    const user = await User.findOne({ $or: [{ emailNormalized: identifier }, { usernameNormalized: identifier }] }).select("+passwordHash").lean();
    dummyHash ??= hashPassword("not-a-user-password-random-dummy-hash");
    const correct = await verifyPassword(user?.passwordHash ?? await dummyHash, password);
    if (!correct || !user || user.status !== "active") return null;
    try { return await identity.issueSession(String(user._id), { expectedCredentialsVersion: user.credentialsVersion ?? 0 }); }
    catch (error) { if (error instanceof StaleCredentialsError) return null; throw error; }
  }
  return { register, requestToken, verifyEmail, resetPassword, login };
}
