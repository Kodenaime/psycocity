import { Schema, type Connection } from "mongoose";
const inviteSchema = new Schema({ email: { type: String, required: true }, tokenHash: { type: String, required: true, select: false }, expiresAt: { type: Date, required: true }, status: { type: String, enum: ["pending", "used", "revoked"], default: "pending", required: true }, issuedBy: Schema.Types.ObjectId, source: { type: String, enum: ["bootstrap", "staff"], required: true }, usedAt: Date }, { timestamps: true, strict: "throw" });
inviteSchema.index({ tokenHash: 1 }, { unique: true }); inviteSchema.index({ status: 1, expiresAt: 1 });
const settingSchema = new Schema({ key: { type: String, required: true }, version: { type: Number, default: 0 }, value: Schema.Types.Mixed }, { timestamps: true, strict: "throw" }); settingSchema.index({ key: 1 }, { unique: true });
const auditSchema = new Schema({ actorId: Schema.Types.ObjectId, action: { type: String, required: true }, entityId: Schema.Types.ObjectId, summary: Schema.Types.Mixed }, { timestamps: true, strict: "throw" }); auditSchema.index({ createdAt: -1, _id: -1 }); auditSchema.index({ actorId: 1, createdAt: -1 });
export function createAdminModels(connection: Connection) {
  return { Invite: connection.models.StaffInvitation as ReturnType<typeof buildInvite> ?? buildInvite(), Setting: connection.models.SystemSetting as ReturnType<typeof buildSetting> ?? buildSetting(), Audit: connection.models.AuditEvent as ReturnType<typeof buildAudit> ?? buildAudit() };
  function buildInvite() { return connection.model("StaffInvitation", inviteSchema); }
  function buildSetting() { return connection.model("SystemSetting", settingSchema); }
  function buildAudit() { return connection.model("AuditEvent", auditSchema); }
}
