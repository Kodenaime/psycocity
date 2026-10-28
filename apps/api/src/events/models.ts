import { Schema, type Connection } from "mongoose";
const eventSchema = new Schema({
  purpose: {type: String, enum: ["admission", "professional"], default: "admission", immutable: true},
  title: { type: String, required: true }, track: { type: String, enum: ["academy", "established"], required: true, immutable: true },
  description: { type: String, required: true }, instructions: String,
  mode: { type: String, enum: ["in_person", "online", "hybrid"], required: true }, venue: String, meetingUrl: String,
  startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true }, capacity: { type: Number, required: true },
  status: { type: String, enum: ["scheduled", "cancelled"], default: "scheduled", required: true },
  version: { type: Number, default: 0, required: true }, reservationRevision: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, required: true, immutable: true },
}, {timestamps: true, strict: "throw", versionKey: false});
const invitationSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, required: true, immutable: true }, applicationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  memberId: {type: Schema.Types.ObjectId, immutable: true},
  ownerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true },
  rsvp: { type: String, enum: ["pending", "confirmed", "declined"], default: "pending", required: true },
  attendance: { type: String, enum: ["unrecorded", "present", "absent", "late", "excused"], default: "unrecorded", required: true },
  rescheduleStatus:{type:String,enum:["none","pending","resolved"],default:"none"},rescheduleReason:{type:String,default:"",maxlength:1000},suggestedStartsAt:Date,suggestedEndsAt:Date,
  outcome: { type: String, maxlength: 2000, default: "" },
  status: { type: String, enum: ["active", "cancelled"], default: "active", required: true },
  version: { type: Number, default: 0, required: true }, eventVersion: { type: Number, default: 0, required: true },
}, {timestamps: true, strict: "throw", versionKey: false});
invitationSchema.index({eventId: 1, applicationId: 1}, {unique: true});
eventSchema.index({purpose: 1, _id: -1});
invitationSchema.index({memberId: 1, _id: -1});
invitationSchema.index({ownerId: 1, _id: -1});
invitationSchema.index({applicationId: 1, status: 1});
export function createEventModels(connection: Connection) {
  return { Event: connection.models.AdmissionEvent as ReturnType<typeof buildEvent> ?? buildEvent(), Invitation: connection.models.EventInvitation as ReturnType<typeof buildInvitation> ?? buildInvitation() };
  function buildEvent() { return connection.model("AdmissionEvent", eventSchema); }
  function buildInvitation() { return connection.model("EventInvitation", invitationSchema); }
}
