import { createMemberGuard } from "../members/guard.js";
import { createMemberModels } from "../members/models.js";
import { createProfileModels } from "../members/profiles-models.js";
import { createPublicationReader } from "../members/publication.js";
import express from "express";
import { Types, type ClientSession } from "mongoose";
import { assignCastingSchema, assignEventSchema, createEventSchema, invitationOutcomeSchema, invitationRsvpSchema, pageQuerySchema, updateEventSchema } from "@psycocity/validation";
import type { Identity, IdentityService } from "../identity/service.js";
import type { AuthConfig } from "../identity/config.js";
import type { MailRuntime } from "../identity/auth-service.js";
import { requireIdentity, requireRoles } from "../identity/middleware.js";
import { requireCsrf, requireVerified, sameOriginJson } from "../identity/security.js";
import { createApplicationModels } from "../applications/models.js";
import { createAdminModels } from "../admin/models.js";
import { AdminActionError } from "../admin/service.js";
import { sendError } from "../http.js";
import { createEventModels } from "./models.js";
class ScheduleError extends Error { constructor(public status: number, message: string) { super(message); } }
const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{24}$/.test(value);
const eligible = ["under_review", "shortlisted", "assessment_scheduled"];
export function createEventRouters(identity: IdentityService, config: AuthConfig, mail: MailRuntime, authorize?: (actor: Identity, session: ClientSession) => Promise<void>, professional = false) {
  const connection = identity.models.User.db; const {Event, Invitation} = createEventModels(connection);
  const {Application, Transition} = createApplicationModels(connection); const {Setting, Audit} = createAdminModels(connection);
  const admin = express.Router(); const owner = express.Router();
  const purpose = professional ? "professional" : "admission"; const purposeFilter = professional ? {purpose: "professional" as const} : {purpose: {$ne: "professional" as const}}; const guard = createMemberGuard(identity); const members = createMemberModels(connection); const publication = createPublicationReader(identity);
  type EventRecord = NonNullable<Awaited<ReturnType<typeof Event.findOne>>>;
  const eventDto = (event: EventRecord, access = true) => ({id: String(event._id), title: event.title, track: event.track, description: event.description, instructions: access ? event.instructions ?? "" : "", mode: event.mode, venue: access ? event.venue ?? "" : "", meetingUrl: access ? event.meetingUrl ?? "" : "", startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(), capacity: event.capacity, status: event.status, version: event.version});
  // Every reservation mutation takes the same database write fence, including
  // reservations across different events, to prevent concurrent owner overlaps.
  async function fence(session: ClientSession) { await Setting.updateOne({key: "admission-schedule"}, {$inc: {version: 1}}, {upsert: true, session}); }
  async function notify(invitation: {ownerId: Types.ObjectId; _id: Types.ObjectId; version: number}, event: EventRecord, session: ClientSession, reason: string) {
    if (!mail) throw new ScheduleError(503, "Scheduling notifications are unavailable");
    const user = await identity.models.User.findById(invitation.ownerId).session(session).lean(); if (!user) throw new ScheduleError(409, "Applicant account unavailable");
    await mail.enqueue({to: user.emailNormalized, subject: `Psycocity ${professional ? "professional casting" : "admission appointment"} ${reason}`, text: `${event.title}: your ${professional ? "professional casting" : "admission appointment"} was ${reason}. All times in the portal are shown in Africa/Lagos (WAT). Sign in to view your current assigned slot and private joining details:\n${new URL(professional ? "/member/model" : "/applicant/dashboard", config.origin).href}\n\nCheck the portal for the latest details. ${professional ? "Casting invitations do not guarantee a booking or paid work." : "No payment is due before acceptance."}`}, `${professional ? "casting" : "admission"}:${invitation._id}:${event.version}:${invitation.version}:${reason}`, session);
  }
  function mutation(handler: (request: express.Request, response: express.Response, actor: Identity, session: ClientSession) => Promise<unknown>): express.RequestHandler {
    return async (request, response) => {
      try {
        await connection.transaction(async session => { const actor = response.locals.identity as Identity; if (authorize) await authorize(actor, session); await fence(session); await handler(request, response, actor, session); });
        response.json({message: professional ? "Professional casting updated" : "Admission schedule updated"});
      } catch (error) {
        if (error instanceof ScheduleError) { sendError(response, error.status, error.status === 403 ? "FORBIDDEN" : error.status === 404 ? "NOT_FOUND" : error.status === 503 ? "UNAVAILABLE" : "CONFLICT", error.message); return; }
        if (error instanceof AdminActionError) { sendError(response, 403, "MFA_REQUIRED", error.message); return; }
        throw error;
      }
    };
  }
  admin.get("/", async (request, response) => {
    const query = pageQuerySchema.safeParse(request.query); if (!query.success) { sendError(response, 400, "INVALID_REQUEST", "Check event pagination"); return; }
    const rows = await Event.find({...purposeFilter, ...(query.data.cursor ? {_id: {$lt: new Types.ObjectId(query.data.cursor)}} : {})}).sort({_id: -1}).limit(query.data.limit + 1);
    const page = rows.slice(0, query.data.limit); response.json({items: page.map(value => eventDto(value)), nextCursor: rows.length > query.data.limit ? String(page.at(-1)!._id) : null});
  });
  admin.get("/members", async (request, response) => {
    if (!professional) {sendError(response, 404, "NOT_FOUND", "Route unavailable"); return;} const parsed = pageQuerySchema.safeParse(request.query); if (!parsed.success) {sendError(response, 400, "INVALID_REQUEST", "Check pagination"); return;}
    const rows = await members.Member.find({$or:[{type:"model"},{type:"student",representationApprovedAt:{$ne:null}}], status: "active", ...(parsed.data.cursor ? {_id: {$lt: new Types.ObjectId(parsed.data.cursor)}} : {})}).sort({_id: -1}).limit(parsed.data.limit + 1); const items = [];
    for (const member of rows.slice(0,parsed.data.limit)) {const proof = await publication.proof(String(member._id)); if (!proof) continue; const draft = await createProfileModels(connection).Draft.findOne({memberId: member._id}).select("data").lean(); items.push({id: String(member._id), name: draft?.data?.professionalName || proof.user.emailNormalized, email: proof.user.emailNormalized});}
    response.json({items, nextCursor: rows.length > parsed.data.limit ? String(rows[parsed.data.limit - 1]!._id) : null});
  });
  admin.get("/:id/invitations", async (request, response) => {
    if (!validId(request.params.id)) { sendError(response, 404, "NOT_FOUND", "Event not found"); return; }
    const event = await Event.findOne({_id: request.params.id, ...purposeFilter}); const query = pageQuerySchema.safeParse(request.query);
    if (!event || !query.success) { sendError(response, 404, "NOT_FOUND", "Event or page not found"); return; }
    const rows = await Invitation.find({eventId: event._id, ...(query.data.cursor ? {_id: {$lt: new Types.ObjectId(query.data.cursor)}} : {})}).sort({_id: -1}).limit(query.data.limit + 1);
    const page = rows.slice(0, query.data.limit); response.json({items: page.map(value => ({id: String(value._id), applicationId: String(value.applicationId), event: eventDto(event), startsAt: value.startsAt.toISOString(), endsAt: value.endsAt.toISOString(), version: value.version, status: value.status, rsvp: value.rsvp, attendance: value.attendance, outcome: value.outcome})), nextCursor: rows.length > query.data.limit ? String(page.at(-1)!._id) : null});
  });
  admin.use(sameOriginJson(config.origin), requireCsrf, express.json({limit: "12kb"}));
  admin.post("/", mutation(async (request, _response, actor, session) => {
    const parsed = createEventSchema.safeParse(request.body); if (!parsed.success) throw new ScheduleError(409, "Check event details, time ordering and joining information");
    if (professional && parsed.data.track !== "established") throw new ScheduleError(409, "Professional castings require represented models");
    if (Date.parse(parsed.data.startsAt) <= Date.now()) throw new ScheduleError(409, "New events must start in the future");
    const [event] = await Event.create([{...parsed.data, purpose, createdBy: actor.userId}], {session});
    await Audit.create([{actorId: actor.userId, action: `${professional ? "casting" : "admission"}.event_created`, entityId: event!._id}], {session});
  }));
  admin.post("/:id/update", mutation(async (request, _response, actor, session) => {
    const parsed = updateEventSchema.safeParse(request.body); if (!validId(request.params.id) || !parsed.success) throw new ScheduleError(409, "Check event details and version");
    const event = await Event.findOne({_id: request.params.id, ...purposeFilter}).session(session); if (!event) throw new ScheduleError(404, "Event not found");
    const input = parsed.data; if (event.version !== input.version || event.status !== "scheduled") throw new ScheduleError(409, "Event changed or is cancelled. Refresh.");
    const invitations = await Invitation.find({eventId: event._id, status: "active"}).session(session);
    const shift = Date.parse(input.startsAt) - event.startsAt.getTime();
    if (!input.cancelled && Date.parse(input.startsAt) <= Date.now()) throw new ScheduleError(409, "Rescheduled events must start in the future");
    if (!input.cancelled && invitations.filter(value => value.rsvp !== "declined").length > input.capacity) throw new ScheduleError(409, "Capacity is below existing reservations");
    for (const invitation of invitations) {
      if (String(invitation.ownerId) === actor.userId) throw new ScheduleError(403, "Another staff member must manage your appointment");
      if (invitation.attendance !== "unrecorded" && !input.cancelled) throw new ScheduleError(409, "An assessed event cannot be rescheduled");
      const start = new Date(invitation.startsAt.getTime() + shift); const end = new Date(invitation.endsAt.getTime() + shift);
      if (!input.cancelled && (end.getTime() > Date.parse(input.endsAt) || await Invitation.exists({ownerId: invitation.ownerId, eventId: {$ne: event._id}, status: "active", rsvp: {$ne: "declined"}, startsAt: {$lt: end}, endsAt: {$gt: start}}).session(session))) throw new ScheduleError(409, "Rescheduling conflicts with an assigned appointment");
      invitation.startsAt = start; invitation.endsAt = end; invitation.version++; invitation.eventVersion = event.version + 1;
      if (input.cancelled) invitation.status = "cancelled"; else invitation.rsvp = "pending";
      await invitation.save({session});
      if (input.cancelled && !professional) {
        const application = await Application.findOne({_id: invitation.applicationId, status: "assessment_scheduled"}).session(session);
        if (application && !(await Invitation.exists({applicationId: application._id, _id: {$ne: invitation._id}, status: "active", rsvp: {$ne: "declined"}}).session(session))) { application.status = "shortlisted"; application.version++; await application.save({session}); await Transition.create([{applicationId: application._id, from: "assessment_scheduled", to: "shortlisted", actorId: actor.userId, version: application.version, publicMessage: "Admission appointment cancelled. The agency will advise on the next step."}], {session}); }
      }
    }
    const {version: _version, cancelled, ...values} = input;
    const mutable = {...values, version: event.version + 1, status: cancelled ? "cancelled" as const : event.status};
    const changed = await Event.updateOne({_id: event._id, version: input.version, ...purposeFilter}, {$set: mutable}, {session}); if (changed.modifiedCount !== 1) throw new ScheduleError(409, "Event changed. Refresh."); Object.assign(event, mutable);
    for (const invitation of invitations) await notify(invitation, event, session, cancelled ? "cancelled" : "updated");
    await Audit.create([{actorId: actor.userId, action: `${purpose}.${cancelled ? "event_cancelled" : "event_updated"}`, entityId: event._id}], {session});
  }));
  admin.post("/:id/invitations", mutation(async (request, _response, actor, session) => {
    const parsed = (professional ? assignCastingSchema : assignEventSchema).safeParse(request.body); if (!parsed.success || !validId(request.params.id)) throw new ScheduleError(409, "Check applicant, versions and slot times");
    const input = parsed.data; const event = await Event.findOne({_id: request.params.id, ...purposeFilter}).session(session); const represented = professional ? await publication.proof(input.applicationId, session) : null; const application = await Application.findById(professional ? represented?.entitlement.applicationId : input.applicationId).session(session);
    if (!event || !application) throw new ScheduleError(404, "Event or application not found");
    if (String(application.ownerId) === actor.userId) throw new ScheduleError(403, "Another staff member must schedule your application");
    if (event.status !== "scheduled" || event.version !== input.eventVersion || (!professional && (application.version !== input.applicationVersion || !eligible.includes(application.status))) || professional && !represented || application.consentHold || !professional && event.track !== application.track) throw new ScheduleError(409, "The event or application is no longer eligible. Refresh.");
    const start = new Date(input.startsAt); const end = new Date(input.endsAt);
    if (start <= new Date() || start < event.startsAt || end > event.endsAt) throw new ScheduleError(409, "The assigned slot must be in the future and inside the event");
    const existing = await Invitation.findOne({eventId: event._id, applicationId: application._id}).session(session);
    if (existing?.attendance !== undefined && existing.attendance !== "unrecorded") throw new ScheduleError(409, "An assessed appointment cannot be reassigned");
    const capacity = await Invitation.countDocuments({eventId: event._id, status: "active", rsvp: {$ne: "declined"}, ...(existing ? {_id: {$ne: existing._id}} : {})}).session(session);
    if (capacity >= event.capacity) throw new ScheduleError(409, "Event capacity has been reached");
    const overlap = await Invitation.exists({status: "active", rsvp: {$ne: "declined"}, ...(existing ? {_id: {$ne: existing._id}} : {}), $or: [{ownerId: application.ownerId, startsAt: {$lt: end}, endsAt: {$gt: start}}, {eventId: event._id, startsAt: {$lt: end}, endsAt: {$gt: start}}]}).session(session);
    if (overlap) throw new ScheduleError(409, "The applicant or assigned event slot overlaps another appointment");
    const invitation = existing ?? new Invitation({eventId: event._id, applicationId: application._id, ownerId: application.ownerId, ...(represented ? {memberId: represented.member._id} : {})});
    invitation.startsAt = start; invitation.endsAt = end; invitation.status = "active"; invitation.rsvp = "pending"; invitation.version++; invitation.eventVersion = event.version; await invitation.save({session});
    if (!professional && application.status !== "assessment_scheduled") {
      const from = application.status; application.status = "assessment_scheduled"; application.version++; await application.save({session});
      await Transition.create([{applicationId: application._id, from, to: application.status, actorId: actor.userId, version: application.version, publicMessage: "An admission appointment has been assigned. View your invitations and confirm attendance."}], {session});
    } else { await Application.updateOne({_id: application._id}, {$inc: {eligibilityRevision: 1}}, {session}); }
    await Event.updateOne({_id: event._id}, {$inc: {reservationRevision: 1}}, {session});
    await notify(invitation, event, session, existing ? "rescheduled" : "assigned");
    await Audit.create([{actorId: actor.userId, action: `${professional ? "casting" : "admission"}.slot_assigned`, entityId: invitation._id}], {session});
  }));
  admin.post("/invitations/:id/outcome", mutation(async (request, _response, actor, session) => {
    const parsed = invitationOutcomeSchema.safeParse(request.body); if (!parsed.success || !validId(request.params.id)) throw new ScheduleError(409, "Check attendance, applicant-visible outcome and version");
    const invitation = await Invitation.findById(request.params.id).session(session);
    if (!invitation || Boolean(invitation.memberId) !== professional || invitation.status !== "active" || invitation.version !== parsed.data.version || invitation.startsAt > new Date()) throw new ScheduleError(409, "Appointment changed or has not started");
    if (String(invitation.ownerId) === actor.userId) throw new ScheduleError(403, "Another staff member must assess your appointment");
    if (professional) {
      const event = await Event.findOne({_id: invitation.eventId, ...purposeFilter}).session(session); const proof = invitation.memberId ? await publication.proof(String(invitation.memberId), session) : null; if (!event || !proof) throw new ScheduleError(409, "Casting membership is unavailable");
      invitation.attendance = parsed.data.attendance; invitation.outcome = parsed.data.outcome; invitation.version++; await invitation.save({session}); await Audit.create([{actorId: actor.userId, action: "casting.outcome_recorded", entityId: invitation._id}], {session}); return;
    }
    const application = await Application.findById(invitation.applicationId).session(session);
    if (!application || application.consentHold || !["assessment_scheduled", "assessed"].includes(application.status)) throw new ScheduleError(409, "Application cannot be assessed");
    invitation.attendance = parsed.data.attendance; invitation.outcome = parsed.data.outcome; invitation.version++; await invitation.save({session});
    const from = application.status; application.status = "assessed"; application.version++; await application.save({session});
    await Transition.create([{applicationId: application._id, from, to: "assessed", actorId: actor.userId, version: application.version, publicMessage: "Your admission assessment outcome has been recorded. This is not an acceptance or payment request."}], {session});
    await Audit.create([{actorId: actor.userId, action: `${professional ? "casting" : "admission"}.outcome_recorded`, entityId: invitation._id}], {session});
  }));
  owner.use(requireIdentity(identity), requireRoles(professional ? "model" : "applicant"), requireVerified, async (_request, response, next) => {if (professional && !(await guard(response.locals.identity as Identity, "model"))) {sendError(response, 403, "FORBIDDEN", "Active represented-model membership is required"); return;} next();}, (_request, response, next) => {response.set("Cache-Control", "no-store"); next();});
  owner.get("/", async (request, response) => {
    const query = pageQuerySchema.safeParse(request.query); if (!query.success) {sendError(response, 400, "INVALID_REQUEST", "Check invitation pagination"); return;}
    const rows = await Invitation.find({memberId: {$exists: professional}, ownerId: (response.locals.identity as Identity).userId, ...(query.data.cursor ? {_id: {$lt: new Types.ObjectId(query.data.cursor)}} : {})}).sort({_id: -1}).limit(query.data.limit + 1);
    const page = rows.slice(0, query.data.limit); const items = [];
    for (const invitation of page) {
      const event = await Event.findOne({_id: invitation.eventId, ...purposeFilter}); const application = await Application.findById(invitation.applicationId).select("status consentHold"); if (!event) continue;
      const access = Boolean(application && !application.consentHold && (professional || eligible.includes(application.status)) && invitation.status === "active" && invitation.rsvp !== "declined" && event.status === "scheduled");
      items.push({id: String(invitation._id), applicationId: String(invitation.applicationId), event: eventDto(event, access), startsAt: invitation.startsAt.toISOString(), endsAt: invitation.endsAt.toISOString(), version: invitation.version, status: invitation.status, rsvp: invitation.rsvp, attendance: invitation.attendance, outcome: invitation.outcome});
    }
    response.json({items, nextCursor: rows.length > query.data.limit ? String(page.at(-1)!._id) : null});
  });
  owner.post("/:id/rsvp", sameOriginJson(config.origin), requireCsrf, express.json({limit: "2kb"}), async (request, response) => {
    const input = invitationRsvpSchema.safeParse(request.body); if (!input.success || !validId(request.params.id)) {sendError(response, 400, "INVALID_REQUEST", "Check RSVP and invitation version"); return;}
    try {
      await connection.transaction(async session => {
        await fence(session); const actor = response.locals.identity as Identity;
        if (professional && !(await guard(actor, "model", session))) throw new ScheduleError(403, "Represented membership unavailable");
        const invitation = await Invitation.findOne({_id: request.params.id, ownerId: actor.userId, memberId: {$exists: professional}}).session(session); if (!invitation) throw new ScheduleError(404, "Invitation not found");
        const event = await Event.findOne({_id: invitation.eventId, ...purposeFilter}).session(session); const application = await Application.findById(invitation.applicationId).session(session);
        if (!event || !application || application.consentHold || (!professional && !eligible.includes(application.status)) || invitation.status !== "active" || event.status !== "scheduled" || invitation.version !== input.data.version || invitation.startsAt <= new Date()) throw new ScheduleError(409, "Appointment changed, closed or is no longer eligible");
        if (input.data.rsvp === "confirmed" && invitation.rsvp === "declined") {
          const count = await Invitation.countDocuments({eventId: event._id, status: "active", rsvp: {$ne: "declined"}}).session(session);
          if (count >= event.capacity || await Invitation.exists({_id: {$ne: invitation._id}, status: "active", rsvp: {$ne: "declined"}, $or: [{ownerId: invitation.ownerId}, {eventId: event._id}], startsAt: {$lt: invitation.endsAt}, endsAt: {$gt: invitation.startsAt}}).session(session)) throw new ScheduleError(409, "Capacity or slot is no longer available. Contact the agency.");
        }
        invitation.rsvp = input.data.rsvp; invitation.version++; await invitation.save({session});
        await Application.updateOne({_id: application._id}, {$inc: {eligibilityRevision: 1}}, {session});
        await Event.updateOne({_id: event._id}, {$inc: {reservationRevision: 1}}, {session});
        await notify(invitation, event, session, input.data.rsvp);
      });
      response.json({message: "RSVP saved"});
    } catch (error) {if (error instanceof ScheduleError) {sendError(response, error.status, error.status === 404 ? "NOT_FOUND" : "CONFLICT", error.message); return;} throw error;}
  });
  return {admin, owner};
}
