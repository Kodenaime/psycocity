import { createEventModels } from "../../apps/api/src/events/models.js";
import * as OTPAuth from "otpauth";
import { createAdminService } from "../../apps/api/src/admin/service.js";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applicationPrivacyVersion, applicationTermsVersion, lagosDate } from "@psycocity/validation";
import { createDatabase } from "../../apps/api/src/database.js";
import { testMongoUri } from "../../apps/api/src/config.js";
import { createIdentityModels } from "../../apps/api/src/identity/models.js";
import { createIdentityService } from "../../apps/api/src/identity/service.js";
import { readAuthConfig } from "../../apps/api/src/identity/config.js";
import { createApplicationModels } from "../../apps/api/src/applications/models.js";
import { createOutboxModel } from "../../apps/api/src/mail/models.js";
import { createOutbox } from "../../apps/api/src/mail/outbox.js";
import { localMailSender, type Mail } from "../../apps/api/src/mail/delivery.js";
import { localPrivateStorage, type PrivateStorage } from "../../apps/api/src/media/storage.js";
import { createApp } from "../../apps/api/src/app.js";
import { safeErrorHandler } from "../../apps/api/src/errors.js";
import type { Express } from "express";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated _test database required");
const database = createDatabase(uri); const connection = database.connection.useDb(`schedule_${randomUUID().replaceAll("-", "")}_test`);
const identity = createIdentityService(createIdentityModels(connection));
const applications = createApplicationModels(connection);
const key = randomBytes(32); const model = createOutboxModel(connection); const outbox = createOutbox(model, key);
let directory: string; let storage: PrivateStorage; let app: Express; let picture: Buffer;
const sender = async (mail: Mail, key: string) => localMailSender("test", `${directory}/mail`)(mail, key);
const mail = { ...outbox, model, sender };
const origin = "http://localhost:5173"; const common = { Origin: origin, "X-Requested-With": "Psycocity" };
const config = readAuthConfig({ APP_ORIGIN: origin }, "test");
const declarations = { accuracy: true, termsAccepted: true, privacyAccepted: true, termsVersion: applicationTermsVersion, privacyVersion: applicationPrivacyVersion };
const answers = {
  personal: { legalName: "Sample Applicant", birthDate: "2000-01-01", phone: "08012345678" },
  location: { country: "Nigeria", state: "Lagos", city: "Ikeja" },
  measurements: { heightCm: 175, waistCm: 70, shoeSize: 40, shoeSystem: "EU" },
  background: { introduction: "I am ready to develop my modelling craft and professional confidence.", interests: "Editorial and runway", availability: "Weekends", experience: "I have worked on local fashion campaigns." },
  academy: { learningGoals: "Develop my runway and portfolio skills", hybridAvailability: "Weekends in person and online" },
  established: { representationHistory: "Independent", contractualRestrictions: "None" },
};
async function fixture(track: "academy" | "established" = "academy", age?: number) {
  const email = `${randomUUID()}@example.test`;
  const user = await identity.models.User.create({ emailNormalized: email, passwordHash: "internal-session-fixture", emailVerifiedAt: new Date(), roles: ["applicant"] });
  const session = await identity.issueSession(String(user._id));
  const headers = { ...common, Cookie: `psycocity_session=${session.token}`, "X-CSRF-Token": session.csrfToken };
  const created = await request(app).post("/api/v1/applications").set(headers).send({ track }); const id = created.body.id as string;
  const data = structuredClone(answers); if (age) data.personal.birthDate = `${Number(lagosDate().slice(0, 4)) - age}-01-01`;
  await request(app).patch(`/api/v1/applications/${id}`).set(headers).send({ version: 0, answers: data }).expect(200);
  return { id, headers, email };
}
async function photos(who: Awaited<ReturnType<typeof fixture>>) {
  for (const slot of ["headshot", "profile", "full_body_front", "full_body_side"]) {
    const grant = await request(app).post("/api/v1/media/uploads").set(who.headers).send({ applicationId: who.id, slot }); expect(grant.status).toBe(201);
    await request(app).put(grant.body.uploadUrl).set(who.headers).set("X-Upload-Token", grant.body.uploadToken).set("Content-Type", "image/png").send(picture).expect(200);
  }
}
beforeAll(async () => {
  await database.connect(); await mkdir(".cache", { recursive: true }); directory = await mkdtemp(".cache/submission-test-"); storage = localPrivateStorage("test", `${directory}/media`);
  app = createApp({ identityService: identity, authConfig: config, mail, storage, adminKey: key }); app.use(safeErrorHandler);
  for (const value of Object.values(connection.models)) await value.createIndexes();
  picture = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#e7db9d" } }).png().toBuffer();
});
afterAll(async () => {
  try { if (database.connection.readyState === 1) for (const value of Object.values(connection.models)) await value.collection.drop(); }
  finally { await database.close(); if (directory) await rm(directory, { recursive: true, force: true }); }
});


async function staff() {
  const user = await identity.models.User.create({ emailNormalized: `${randomUUID()}@example.test`, passwordHash: "session-fixture", roles: ["admin", "applicant"], staffStatus: "active", emailVerifiedAt: new Date() });
  const service = createAdminService(identity, mail, key, origin);
  const pending = await identity.issueSession(String(user._id)); const actor = (await identity.authenticate(pending.token))!;
  const setup = (await service.enroll(actor))!;
  const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(setup.secret), algorithm: "SHA1", digits: 6, period: 30 }).generate();
  const verified = (await service.verifyMfa(actor, "totp", code))!;
  return { userId: user._id, headers: { ...common, Cookie: `psycocity_session=${verified.session.token}`, "X-CSRF-Token": verified.session.csrfToken } };
}
async function submitted() {
  const who = await fixture(); await photos(who);
  const result = await request(app).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({ version: 1, declarations }).expect(200);
  return { ...who, version: result.body.version as number };
}

const base = () => Date.now() + 7 * 24 * 60 * 60_000;
async function schedule(admin: Awaited<ReturnType<typeof staff>>, capacity = 2, track = "academy") {
  const start = base(); const body = {title: `Admission ${randomUUID()}`, track, description: "Private admission assessment for applicants", instructions: "Bring your portfolio", mode: "online", venue: "", meetingUrl: "https://example.test/private-assessment", startsAt: new Date(start).toISOString(), endsAt: new Date(start + 3 * 60 * 60_000).toISOString(), capacity};
  await request(app).post("/api/v1/admin/events").set(admin.headers).send(body).expect(200);
  const list = await request(app).get("/api/v1/admin/events").set(admin.headers).expect(200);
  const event = list.body.items.find((value: {title: string}) => value.title === body.title) as {id: string; version: number};
  return {event, body, start};
}
async function reviewable() {
  const who = await submitted(); await applications.Application.updateOne({_id: who.id}, {$set: {status: "shortlisted"}}); return who;
}
const slot = (event: Awaited<ReturnType<typeof schedule>>, who: Awaited<ReturnType<typeof submitted>>, offset = 0) => ({applicationId: who.id, applicationVersion: who.version, eventVersion: event.event.version, startsAt: new Date(event.start + offset * 60_000).toISOString(), endsAt: new Date(event.start + (offset + 15) * 60_000).toISOString()});
describe("transactional admission scheduling", () => {
  it("enforces concurrent capacity, private joining details, RSVP and versioned rescheduling/cancellation", async () => {
    const admin = await staff(); const first = await reviewable(); const second = await reviewable(); const event = await schedule(admin, 1);
    const results = await Promise.all([first, second].map((who, index) => request(app).post(`/api/v1/admin/events/${event.event.id}/invitations`).set(admin.headers).send(slot(event, who, index * 20))));
    expect(results.map(value => value.status).sort()).toEqual([200, 409]);
    const winner = results[0]!.status === 200 ? first : second; const loser = winner.id === first.id ? second : first;
    const own = await request(app).get("/api/v1/invitations").set(winner.headers).expect(200); expect(own.body.items).toHaveLength(1);
    const invite = own.body.items[0]; expect(invite.event.meetingUrl).toContain("private-assessment");
    expect((await request(app).get("/api/v1/invitations").set(loser.headers)).body.items).toHaveLength(0);
    await request(app).post(`/api/v1/invitations/${invite.id}/rsvp`).set(loser.headers).send({version: invite.version, rsvp: "confirmed"}).expect(404);
    await request(app).post(`/api/v1/invitations/${invite.id}/rsvp`).set(winner.headers).send({version: invite.version, rsvp: "confirmed"}).expect(200);
    await request(app).post(`/api/v1/invitations/${invite.id}/rsvp`).set(winner.headers).send({version: invite.version, rsvp: "declined"}).expect(409);
    const {track: _track, ...body} = event.body; const shifted = {...body, version: 0, startsAt: new Date(event.start + 24 * 60 * 60_000).toISOString(), endsAt: new Date(event.start + 27 * 60 * 60_000).toISOString()};
    await request(app).post(`/api/v1/admin/events/${event.event.id}/update`).set(admin.headers).send(shifted).expect(200);
    const updated = (await request(app).get("/api/v1/invitations").set(winner.headers)).body.items[0];
    expect(updated.rsvp).toBe("pending"); expect(Date.parse(updated.startsAt) - Date.parse(invite.startsAt)).toBe(24 * 60 * 60_000);
    await request(app).post(`/api/v1/admin/events/${event.event.id}/update`).set(admin.headers).send(shifted).expect(409);
    await request(app).post(`/api/v1/admin/events/${event.event.id}/update`).set(admin.headers).send({...shifted, version: 1, cancelled: true}).expect(200);
    const cancelled = (await request(app).get("/api/v1/invitations").set(winner.headers)).body.items[0]; expect(cancelled.status).toBe("cancelled"); expect(cancelled.event.meetingUrl).toBe("");
    expect((await applications.Application.findById(winner.id).lean())?.status).toBe("shortlisted");
    expect(await model.countDocuments({dedupeKey: {$regex: `^admission:${invite.id}:`}})).toBe(4);
  });
  it("rejects wrong tracks, consent holds, overlapping slots and premature attendance", async () => {
    const admin = await staff(); const first = await reviewable(); const second = await reviewable(); const event = await schedule(admin); const wrong = await schedule(admin, 2, "established");
    await request(app).post(`/api/v1/admin/events/${wrong.event.id}/invitations`).set(admin.headers).send(slot(wrong, first)).expect(409);
    await applications.Application.updateOne({_id: first.id}, {$set: {consentHold: true}});
    await request(app).post(`/api/v1/admin/events/${event.event.id}/invitations`).set(admin.headers).send(slot(event, first)).expect(409);
    await applications.Application.updateOne({_id: first.id}, {$set: {consentHold: false}});
    await request(app).post(`/api/v1/admin/events/${event.event.id}/invitations`).set(admin.headers).send(slot(event, first)).expect(200);
    await request(app).post(`/api/v1/admin/events/${event.event.id}/invitations`).set(admin.headers).send(slot(event, second)).expect(409);
    const invitation = (await request(app).get("/api/v1/invitations").set(first.headers)).body.items[0];
    await request(app).post(`/api/v1/admin/events/invitations/${invitation.id}/outcome`).set(admin.headers).send({version: invitation.version, attendance: "present", outcome: "Assessment completed."}).expect(409);
    const models = createEventModels(connection);
    await models.Invitation.updateOne({_id: invitation.id}, {$set: {startsAt: new Date(Date.now() - 30_000)}});
    await request(app).post(`/api/v1/admin/events/invitations/${invitation.id}/outcome`).set(admin.headers).send({version: invitation.version, attendance: "present", outcome: "Assessment completed."}).expect(200);
    expect((await applications.Application.findById(first.id).lean())?.status).toBe("assessed");
    await request(app).get("/api/v1/admin/events").set(first.headers).expect(403);
  });
  it("rolls back failed notifications and releases slots when an applicant withdraws", async () => {
    const admin = await staff(); const who = await reviewable(); const event = await schedule(admin, 1);
    const failing = createApp({identityService: identity, authConfig: config, storage, adminKey: key, mail: {...mail, enqueue: async () => {throw new Error("Synthetic scheduling mail failure");}}}); failing.use(safeErrorHandler);
    await request(failing).post(`/api/v1/admin/events/${event.event.id}/invitations`).set(admin.headers).send(slot(event, who)).expect(500);
    const models = createEventModels(connection);
    expect(await models.Invitation.countDocuments({eventId: event.event.id})).toBe(0);
    expect((await applications.Application.findById(who.id).lean())?.status).toBe("shortlisted");
    await request(app).post(`/api/v1/admin/events/${event.event.id}/invitations`).set(admin.headers).send(slot(event, who)).expect(200);
    const current = await request(app).get(`/api/v1/applications/${who.id}`).set(who.headers).expect(200);
    await request(app).post(`/api/v1/applications/${who.id}/withdraw`).set(who.headers).send({version: current.body.version}).expect(200);
    const invitation = (await request(app).get("/api/v1/invitations").set(who.headers)).body.items[0];
    expect(invitation.status).toBe("cancelled"); expect(invitation.event.meetingUrl).toBe("");
    const other = await reviewable();
    await request(app).post(`/api/v1/admin/events/${event.event.id}/invitations`).set(admin.headers).send(slot(event, other)).expect(200);
  });

});
