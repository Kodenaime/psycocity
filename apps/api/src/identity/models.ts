import { Schema, type Connection } from "mongoose";
const userSchema = new Schema({
  emailNormalized: { type: String, required: true, lowercase: true, trim: true },
  usernameNormalized: { type: String, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  roles: { type: [String], enum: ["applicant", "student", "model", "admin"], required: true, default: ["applicant"] },
  status: { type: String, enum: ["active", "suspended"], required: true, default: "active" },
  emailVerifiedAt: Date,
  applicationBlockedUntil:Date,
  applicationRevision:{type:Number,default:0},
  credentialsVersion: { type: Number, required: true, default: 0 },
  isSuperAdmin: {type:Boolean,default:false},
  staffStatus: { type: String, enum: ["active", "deactivated"] },
  mfaEnabledAt: Date,
  mfaSecretEncrypted: { type: String, select: false },
  pendingMfaSecretEncrypted: { type: String, select: false },
  pendingMfaExpiresAt: { type: Date, select: false },
  lastTotpCounter: { type: Number, select: false },
  mfaRecoveryHashes: { type: [String], select: false, default: [] },
}, { timestamps: true, strict: "throw", optimisticConcurrency: true });
userSchema.index({ emailNormalized: 1 }, { unique: true, name: "unique_user_email" });
userSchema.index({isSuperAdmin:1},{unique:true,partialFilterExpression:{isSuperAdmin:true},name:"single_super_admin"});
userSchema.index({ usernameNormalized: 1 }, { unique: true, name: "unique_user_username", partialFilterExpression: { usernameNormalized: { $type: "string" } } });
const sessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  tokenHash: { type: String, required: true, select: false },
  csrfTokenHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  credentialsVersion: { type: Number, required: true, default: 0 },
  mfaVerifiedAt: Date, lastUsedAt: Date,
}, { timestamps: true, strict: "throw" });
sessionSchema.index({ tokenHash: 1 }, { unique: true, name: "unique_session_token" });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "session_expiry_cleanup" });
sessionSchema.index({ userId: 1 });
const authTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  purpose: { type: String, enum: ["email_verification", "password_reset"], required: true },
  tokenHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  consumedAt: Date,
}, { timestamps: true, strict: "throw" });
authTokenSchema.index({ tokenHash: 1 }, { unique: true, name: "unique_auth_token" });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "auth_token_expiry_cleanup" });
const trustedDeviceSchema=new Schema({userId:{type:Schema.Types.ObjectId,required:true},tokenHash:{type:String,required:true,select:false},credentialsVersion:{type:Number,required:true},mfaVerifiedAt:{type:Date,required:true},expiresAt:{type:Date,required:true},revokedAt:Date},{timestamps:true,strict:"throw"});trustedDeviceSchema.index({tokenHash:1},{unique:true});trustedDeviceSchema.index({expiresAt:1},{expireAfterSeconds:0});trustedDeviceSchema.index({userId:1});
export function createIdentityModels(connection: Connection) {
  return {
    TrustedDevice:connection.models.StaffTrustedDevice as ReturnType<typeof buildDevice> ?? buildDevice(),
    User: connection.models.User as ReturnType<typeof buildUser> ?? buildUser(),
    Session: connection.models.Session as ReturnType<typeof buildSession> ?? buildSession(),
    AuthToken: connection.models.AuthToken as ReturnType<typeof buildToken> ?? buildToken(),
  };
  function buildDevice(){return connection.model("StaffTrustedDevice",trustedDeviceSchema);}
  function buildUser() { return connection.model("User", userSchema); }
  function buildSession() { return connection.model("Session", sessionSchema); }
  function buildToken() { return connection.model("AuthToken", authTokenSchema); }
}
export type IdentityModels = ReturnType<typeof createIdentityModels>;
export async function ensureIdentityIndexes(models: IdentityModels) {
  for (const model of Object.values(models)) await model.createIndexes();
}
