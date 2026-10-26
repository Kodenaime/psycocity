import { createPublicationReader } from "../../apps/api/src/members/publication.js";
import { createAcademyNotifications } from "../../apps/api/src/academy/notifications.js";
import { createAcademyModels } from "../../apps/api/src/academy/models.js";
import { createMembershipService } from "../../apps/api/src/members/service.js";
import { createMemberModels } from "../../apps/api/src/members/models.js";
import { createSettlementService } from "../../apps/api/src/payments/settlement.js";
import { hashPassword } from "../../apps/api/src/identity/password.js";
import { decryptPayload } from "../../apps/api/src/mail/crypto.js";
import { createPaymentModel } from "../../apps/api/src/payments/models.js";
import { createOfferModel } from "../../apps/api/src/offers/models.js";
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
import { createOutboxModel } from "../../apps/api/src/mail/models.js";
import { createOutbox } from "../../apps/api/src/mail/outbox.js";
import { localMailSender, type Mail } from "../../apps/api/src/mail/delivery.js";
import { localPrivateStorage, type PrivateStorage } from "../../apps/api/src/media/storage.js";
import { createApp } from "../../apps/api/src/app.js";
import { safeErrorHandler } from "../../apps/api/src/errors.js";
import type { Express } from "express";

const uri = process.env.TEST_MONGODB_URI ?? testMongoUri;
if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated _test database required");
const database = createDatabase(uri); const connection = database.connection.useDb(`cohorts_${randomUUID().replaceAll("-", "")}_test`);
const identity = createIdentityService(createIdentityModels(connection));
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
const password = "a membership test passphrase"; let encoded: string;
beforeAll(async () => {
  encoded = await hashPassword(password); await database.connect(); await mkdir(".cache", { recursive: true }); directory = await mkdtemp(".cache/submission-test-"); storage = localPrivateStorage("test", `${directory}/media`);
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
async function submitted(track: "academy" | "established" = "academy") {
  const who = await fixture(track); await photos(who);
  const result = await request(app).post(`/api/v1/applications/${who.id}/submit`).set(who.headers).send({ version: 1, declarations }).expect(200);
  return { ...who, version: result.body.version as number };
}

const Offer = createOfferModel(connection);
async function assessed(track: "academy" | "established" = "academy") {
  const admin = await staff(); const who = await submitted(track);
  await request(app).post(`/api/v1/admin/applications/${who.id}/actions`).set(admin.headers).send({version: who.version, action: "start_review"}).expect(200);
  await request(app).post(`/api/v1/admin/applications/${who.id}/actions`).set(admin.headers).send({version: who.version + 1, action: "record_assessment"}).expect(200);
  return {...who, version: who.version + 2, admin};
}
const reason = "Your assessment meets our admission requirements.";

async function accepted(track: "academy" | "established" = "academy") {
  const who = await assessed(track); await request(app).post(`/api/v1/admin/applications/${who.id}/decision`).set(who.admin.headers).send({version: who.version, decision: "accept", reason}).expect(200);
  const offer = (await Offer.findOne({applicationId: who.id}).lean())!; return {...who, offer};
}
const Payment = createPaymentModel(connection);

const {Invitation} = createMemberModels(connection); const service = createMembershipService(identity, mail, origin);
async function paid(track: "academy" | "established" = "academy") {
  const who = await accepted(track); await identity.models.User.updateOne({emailNormalized: who.email}, {$set: {passwordHash: encoded}});
  const payment = await Payment.create({offerId: who.offer._id, applicationId: who.id, ownerId: who.offer.ownerId, reference: `psyc_${randomBytes(20).toString("hex")}`, amountKobo: who.offer.amountKobo, currency: "NGN", termsVersion: who.offer.termsVersion, termsAcceptedAt: new Date(), state: "initialized", initializationExpiresAt: new Date()});
  const settle = createSettlementService(identity, {validSignature: () => false, verify: async () => ({id: `${Date.now()}${Math.floor(Math.random() * 10_000)}`, reference: payment.reference, status: "success", amount: payment.amountKobo, currency: "NGN", domain: "test", paid_at: new Date().toISOString(), customer: {email: who.email}, metadata: {applicationId: who.id, offerId: String(who.offer._id)}})}, mail, origin);
  await settle.runOnce(payment.reference); return {...who, payment};
}
async function token(id: string) {
  const invitation = (await Invitation.findOne({entitlementId: id, status: "pending"}).sort({_id: -1}).lean())!;
  const job = (await model.findOne({dedupeKey: `member-invitation:${invitation._id}`}).select("+encryptedPayload").lean())!;
  const message = decryptPayload(job.encryptedPayload!, key) as {text: string}; const raw = new URL(message.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  return {raw, invitation, job};
}
const input = (email: string, raw: string) => ({email, token: raw, password});

async function activated(track: "academy" | "established" = "established") {
  const who = await paid(track); const id = (await service.ensure(who.payment._id))!; const secret = await token(id);
  const response = await request(app).post("/api/v1/member/activate").set(common).send(input(who.email, secret.raw)).expect(200);
  const cookies = response.headers["set-cookie"] as unknown as string[]; const cookie = cookies.map(value => value.split(";")[0]).join("; "); const csrf = cookies.find(value => value.startsWith("psycocity_csrf="))!.split(";")[0]!.split("=")[1]!;
  return {...who, headers: {...common, Cookie: cookie, "X-CSRF-Token": csrf}, type: track === "academy" ? "student" : "model"};
}


const {Cohort,Enrolment,AcademySession,Resource,Attendance,Progress,Assignment,Submission,Certificate}=createAcademyModels(connection);
async function cohort(actor: Awaited<ReturnType<typeof activated>>, capacity=1){const body={name:`Academy ${randomUUID()}`,description:"A real configured academy programme for testing cohort access.",startsOn:lagosDate(),endsOn:new Date(Date.now()+21*24*60*60_000).toISOString().slice(0,10),capacity,archiveAccess:false};await request(app).post("/api/v1/admin/cohorts").set(actor.admin.headers).send(body).expect(200);return (await Cohort.findOne({name:body.name}).lean())!;}
async function memberId(actor: Awaited<ReturnType<typeof activated>>){return (await request(app).get("/api/v1/member/student").set(actor.headers)).body.memberships.find((value:{type:string})=>value.type==="student").id as string;}
describe("paid academy cohorts and enrolment",()=>{
 it("serializes concurrent capacity, rejects models and protects another student's records",async()=>{
  const first=await activated("academy");const second=await activated("academy");const represented=await activated();const group=await cohort(first);const ids=await Promise.all([memberId(first),memberId(second)]);
  const results=await Promise.all(ids.map(memberId=>request(app).post(`/api/v1/admin/cohorts/${group._id}/enrolments`).set(first.admin.headers).send({memberId,cohortVersion:0})));expect(results.map(value=>value.status).sort()).toEqual([200,409]);expect(await Enrolment.countDocuments({cohortId:group._id,status:"active"})).toBe(1);
  const winner=results[0]!.status===200?first:second;const loser=winner===first?second:first;const id=await memberId(winner);
  await request(app).post(`/api/v1/admin/cohorts/${group._id}/enrolments`).set(first.admin.headers).send({memberId:id,cohortVersion:0}).expect(200);
  await request(app).get(`/api/v1/academy/cohorts/${group._id}`).set(winner.headers).expect(200);await request(app).get(`/api/v1/academy/cohorts/${group._id}`).set(loser.headers).expect(404);await request(app).get("/api/v1/academy/cohorts").set(represented.headers).expect(403);await request(app).get("/api/v1/admin/cohorts").set(first.headers).expect(403);
  const model=(await request(app).get("/api/v1/member/model").set(represented.headers)).body.memberships[0];await request(app).post(`/api/v1/admin/cohorts/${group._id}/enrolments`).set(first.admin.headers).send({memberId:model.id,cohortVersion:0}).expect(409);
  const record=(await Enrolment.findOne({cohortId:group._id,memberId:id}).lean())!;
  await request(app).post(`/api/v1/admin/cohorts/enrolments/${record._id}/status`).set(first.admin.headers).send({version:0,status:"suspended",reason:"Pause this cohort enrolment for review."}).expect(200);await request(app).get(`/api/v1/academy/cohorts/${group._id}`).set(winner.headers).expect(404);
  await request(app).post(`/api/v1/admin/cohorts/${group._id}/enrolments`).set(first.admin.headers).send({memberId:await memberId(loser),cohortVersion:0}).expect(200);
  await request(app).post(`/api/v1/admin/cohorts/enrolments/${record._id}/status`).set(first.admin.headers).send({version:1,status:"active",reason:"Capacity must still be enforced on restoration."}).expect(409);
 });
 it("enforces configured archive access after end and denies withdrawn enrolments",async()=>{
  const who=await activated("academy");const group=await cohort(who);const id=await memberId(who);await request(app).post(`/api/v1/admin/cohorts/${group._id}/enrolments`).set(who.admin.headers).send({memberId:id,cohortVersion:0}).expect(200);
  await Cohort.updateOne({_id:group._id},{$set:{endsOn:"2000-01-01"}});await request(app).get(`/api/v1/academy/cohorts/${group._id}`).set(who.headers).expect(404);
  await Cohort.updateOne({_id:group._id},{$set:{archiveAccess:true}});await request(app).get(`/api/v1/academy/cohorts/${group._id}`).set(who.headers).expect(200);
  const record=(await Enrolment.findOne({cohortId:group._id,memberId:id}).lean())!;await request(app).post(`/api/v1/admin/cohorts/enrolments/${record._id}/status`).set(who.admin.headers).send({version:0,status:"withdrawn",reason:"Student has withdrawn from this cohort."}).expect(200);await request(app).get(`/api/v1/academy/cohorts/${group._id}`).set(who.headers).expect(404);
 });
});

it("keeps hybrid timetable links cohort-private and notifications current across reschedules",async()=>{
 const who=await activated("academy");const other=await activated("academy");const group=await cohort(who);await request(app).post(`/api/v1/admin/cohorts/${group._id}/enrolments`).set(who.admin.headers).send({memberId:await memberId(who),cohortVersion:0}).expect(200);
 const date=new Date(Date.now()+86400000).toISOString().slice(0,10);const data={title:"Runway practice",startsAt:`${date}T10:00:00+01:00`,endsAt:`${date}T11:00:00+01:00`,mode:"hybrid",venue:"Private training studio",meetingUrl:"https://example.test/private-class"};const path=`/api/v1/admin/cohorts/${group._id}/sessions`;
 await request(app).post(path).set(who.admin.headers).send({data}).expect(200);const row=(await AcademySession.findOne({cohortId:group._id}).lean())!;
 await request(app).get(`/api/v1/academy/cohorts/${group._id}/sessions`).expect(401);await request(app).get(`/api/v1/academy/cohorts/${group._id}/sessions`).set(other.headers).expect(404);
 const owned=await request(app).get(`/api/v1/academy/cohorts/${group._id}/sessions`).set(who.headers).expect(200);expect(owned.body.items[0].meetingUrl).toBe(data.meetingUrl);
 await request(app).post(path).set(who.admin.headers).send({id:String(row._id),version:0,data:{...data,cancelled:true}}).expect(200);await request(app).post(path).set(who.admin.headers).send({id:String(row._id),version:0,data}).expect(409);
 const jobs=createAcademyNotifications(identity,mail,origin);await jobs.runOnce();await jobs.runOnce();const notifications=await model.find({dedupeKey:{$regex:`^academy-session:${row._id}:`}}).select("+encryptedPayload").lean();expect(notifications).toHaveLength(1);expect(notifications[0]!.dedupeKey).toContain(":1:");expect(JSON.stringify(decryptPayload(notifications[0]!.encryptedPayload!,key))).not.toContain("private-class");
 expect((await request(app).get(`/api/v1/academy/cohorts/${group._id}/sessions`).set(who.headers)).body.items[0].meetingUrl).toBe("");
});

it("authorizes downloads at access time, purges removed content and preserves attendance correction history",async()=>{
 const who=await activated("academy");const other=await activated("academy");const group=await cohort(who);await request(app).post(`/api/v1/admin/cohorts/${group._id}/enrolments`).set(who.admin.headers).send({memberId:await memberId(who),cohortVersion:0}).expect(200);const enrolment=(await Enrolment.findOne({cohortId:group._id}).lean())!;const prefix=`/api/v1/admin/cohorts/${group._id}`;const owner=`/api/v1/academy/cohorts/${group._id}`;
 await request(app).post(`${prefix}/resources`).set(who.admin.headers).send({title:"Practice guide",kind:"text",body:"Private learning exercise"}).expect(200);const resource=(await Resource.findOne({cohortId:group._id}).lean())!;const download=`${owner}/resources/${resource._id}/download`;expect((await request(app).get(download).set(who.headers).expect(200)).headers["content-disposition"]).toContain("attachment");await request(app).get(download).set(other.headers).expect(404);await request(app).get(download).expect(401);
 const scheduled=await AcademySession.create({cohortId:group._id,title:"Completed class",startsAt:new Date(Date.now()-7200000),endsAt:new Date(Date.now()-3600000),mode:"in_person",venue:"Studio"});const data={sessionId:String(scheduled._id),enrolmentId:String(enrolment._id),version:-1,status:"present",reason:"Staff verified attendance in the studio."};await request(app).post(`${prefix}/attendance`).set(who.admin.headers).send(data).expect(200);await request(app).post(`${prefix}/attendance`).set(who.admin.headers).send(data).expect(409);await request(app).post(`${prefix}/attendance`).set(who.admin.headers).send({...data,version:0,status:"excused",reason:"Private correction following an attendance review."}).expect(200);const row=(await Attendance.findOne({sessionId:scheduled._id}).lean())!;expect(row.history).toHaveLength(2);const student=await request(app).get(`${owner}/attendance`).set(who.headers).expect(200);expect(JSON.stringify(student.body)).not.toContain("Private correction");expect(student.body.items[0]).not.toHaveProperty("history");
 await Enrolment.updateOne({_id:enrolment._id},{$set:{status:"suspended"}});await request(app).get(download).set(who.headers).expect(404);await request(app).post(`${prefix}/resources/${resource._id}/remove`).set(who.admin.headers).send({}).expect(200);expect((await Resource.findById(resource._id).select("+body").lean())?.body).toBeUndefined();
});

it("separates staff notes, requires configured completion and grants adult model access only after explicit representation review",async()=>{
 const who=await activated("academy");const group=await cohort(who);await request(app).post(`/api/v1/admin/cohorts/${group._id}/enrolments`).set(who.admin.headers).send({memberId:await memberId(who),cohortVersion:0}).expect(200);const enrolment=(await Enrolment.findOne({cohortId:group._id}).lean())!;const prefix=`/api/v1/admin/cohorts/${group._id}`;const owner=`/api/v1/academy/cohorts/${group._id}`;
 const decision={enrolmentId:String(enrolment._id),version:1,action:"complete",reason:"Staff reviewed the actual configured completion criteria."};await request(app).post(`${prefix}/progress`).set(who.admin.headers).send({enrolmentId:String(enrolment._id),version:0,feedback:"Your runway confidence improved.",privateNotes:"Private staff assessment evidence.",grade:85}).expect(200);const visible=await request(app).get(`${owner}/progress`).set(who.headers).expect(200);expect(JSON.stringify(visible.body)).not.toContain("Private staff");expect(visible.body.items[0]).not.toHaveProperty("privateNotes");await request(app).post(`${prefix}/progress/decision`).set(who.admin.headers).send(decision).expect(409);
 await Cohort.updateOne({_id:group._id},{$set:{endsOn:lagosDate(),minimumAttendancePct:75,minimumAverageGrade:70,completionCriteria:"Attend runway workshops and pass the curriculum assessment."}});const scheduled=await AcademySession.create({cohortId:group._id,title:"Assessed class",startsAt:new Date(Date.now()-7200000),endsAt:new Date(Date.now()-3600000),mode:"in_person"});await Enrolment.collection.updateOne({_id:enrolment._id},{$set:{createdAt:new Date(Date.now()-86400000)}});await Attendance.create({cohortId:group._id,sessionId:scheduled._id,enrolmentId:enrolment._id,status:"present"});
 await request(app).post(`${prefix}/progress/decision`).set(who.admin.headers).send(decision).expect(200);await request(app).post(`${prefix}/progress/decision`).set(who.admin.headers).send(decision).expect(200);await request(app).get("/api/v1/member/model").set(who.headers).expect(403);const issue={enrolmentId:String(enrolment._id),action:"issue",reason:"Staff approved a programme completion certificate."};await request(app).post(`${prefix}/certificates`).set(who.admin.headers).send(issue).expect(200);await request(app).post(`${prefix}/certificates`).set(who.admin.headers).send(issue).expect(200);expect(await Certificate.countDocuments({enrolmentId:enrolment._id})).toBe(1);expect((await request(app).get(`${owner}/certificates`).set(who.headers).expect(200)).body.items[0].studentName).toBe("Sample Applicant");await request(app).post(`${prefix}/certificates`).set(who.admin.headers).send({...issue,action:"revoke",reason:"Revoke while supporting completion evidence is reviewed."}).expect(200);await request(app).post(`${prefix}/certificates`).set(who.admin.headers).send(issue).expect(409);await request(app).post(`${owner}/representation-request`).set(who.headers).send({}).expect(200);await request(app).post(`${owner}/representation-request`).set(who.headers).send({}).expect(409);const progress=(await Progress.findOne({enrolmentId:enrolment._id}).lean())!;await request(app).post(`${prefix}/progress/decision`).set(who.admin.headers).send({...decision,version:progress.version,action:"approve_representation"}).expect(200);
 await request(app).get("/api/v1/member/model").set(who.headers).expect(200);await request(app).get("/api/v1/member/model/professional").set(who.headers).expect(200);const record=(await createMemberModels(connection).Member.findById(enrolment.memberId).lean())!;expect(record.type).toBe("student");expect(record.representationApprovedAt).toBeTruthy();expect((await request(app).get(`/api/v1/models/${record._id}`)).status).toBe(404);expect(await Payment.countDocuments({ownerId:record.userId})).toBe(1);const unentitled=await createMemberModels(connection).Member.create({userId:record.userId,entitlementId:new (await import("mongoose")).Types.ObjectId(),type:"model"});expect(await createPublicationReader(identity).proof(String(unentitled._id))).toBeNull();
 // Age is checked again at the handoff, even if completion evidence exists.
 const {Application}=await import("../../apps/api/src/applications/models.js").then(module=>module.createApplicationModels(connection));await Application.collection.updateOne({_id:new (await import("mongoose")).Types.ObjectId(who.id)},{$set:{"submittedSnapshot.answers.personal.birthDate":`${Number(lagosDate().slice(0,4))-17}-01-01`}});await Progress.updateOne({_id:progress._id},{$set:{representation:"not_requested"}});await request(app).post(`${owner}/representation-request`).set(who.headers).send({}).expect(409);
});

it("versions private assignment submissions, enforces deadlines and protects cross-student work",async()=>{
 const who=await activated("academy");const other=await activated("academy");const group=await cohort(who,2);for(const person of [who,other])await request(app).post(`/api/v1/admin/cohorts/${group._id}/enrolments`).set(who.admin.headers).send({memberId:await memberId(person),cohortVersion:0}).expect(200);const prefix=`/api/v1/admin/cohorts/${group._id}`;const owner=`/api/v1/academy/cohorts/${group._id}`;await request(app).post(`${prefix}/assignments`).set(who.admin.headers).send({data:{title:"Runway reflection",instructions:"Reflect on the taught runway technique and your practice.",dueAt:new Date(Date.now()+86400000).toISOString(),requiredForCompletion:true}}).expect(200);const task=(await Assignment.findOne({cohortId:group._id}).lean())!;const data={assignmentId:String(task._id),assignmentVersion:0,previousRevision:0,body:"My private reflection on runway practice."};await request(app).post(`${owner}/submissions`).set(who.headers).send(data).expect(200);await request(app).post(`${owner}/submissions`).set(who.headers).send(data).expect(409);await request(app).post(`${owner}/submissions`).set(who.headers).send({...data,previousRevision:1,body:"My revised private reflection with further practice."}).expect(200);const rows=await Submission.find({assignmentId:task._id}).sort({revision:1}).select("+body").lean();expect(rows).toHaveLength(2);expect(rows[0]!.body).toBe(data.body);const download=`${owner}/submissions/${rows[0]!._id}/download`;await request(app).get(download).set(other.headers).expect(404);await request(app).get(download).set(who.headers).expect(200);expect((await request(app).get(`${owner}/submissions`).set(other.headers).expect(200)).body.items).toEqual([]);
 await request(app).post(`${prefix}/submissions/assess`).set(who.admin.headers).send({submissionId:String(rows[1]!._id),version:0,grade:80,feedback:"Good reflection with clear evidence of practice."}).expect(200);await request(app).post(`${prefix}/submissions/assess`).set(who.admin.headers).send({submissionId:String(rows[1]!._id),version:0,grade:20,feedback:"Stale concurrent assessment must not replace feedback."}).expect(409);await Assignment.updateOne({_id:task._id},{$set:{dueAt:new Date(Date.now()-1000)}});await request(app).post(`${owner}/submissions`).set(who.headers).send({...data,previousRevision:2}).expect(409);
});
it("publishes structured text only and safely retries durable mail without changing financial state",async()=>{
 const admin=await staff();await request(app).get("/api/v1/admin/content").expect(401);const initial=await request(app).get("/api/v1/admin/content").set(admin.headers).expect(200);const copy={...initial.body.draft,heroFirst:"<script>alert('unsafe')</script>"};await request(app).post("/api/v1/admin/content").set(admin.headers).send({version:0,action:"save",draft:copy}).expect(200);expect((await request(app).get("/api/v1/content")).body.heroFirst).not.toBe(copy.heroFirst);await request(app).post("/api/v1/admin/content").set(admin.headers).send({version:1,action:"publish",draft:copy}).expect(200);expect((await request(app).get("/api/v1/content")).body.heroFirst).toBe(copy.heroFirst);await request(app).post("/api/v1/admin/content").set(admin.headers).send({version:1,action:"publish",draft:copy}).expect(409);
 const dedupe=`ops-test:${randomUUID()}`;await mail.enqueue({to:"failure@example.test",subject:"Delivery failure fixture",text:"Private delivery payload."},dedupe);const job=(await model.findOne({dedupeKey:dedupe}).lean())!;await model.updateOne({_id:job._id},{$set:{state:"failed",attempts:5,lastErrorCode:"DELIVERY_FAILED"}});const history=await request(app).get("/api/v1/admin/notifications").set(admin.headers).expect(200);expect(JSON.stringify(history.body)).not.toContain("encryptedPayload");expect(JSON.stringify(history.body)).not.toContain("failure@example.test");const financialBefore=await Payment.countDocuments();await request(app).post(`/api/v1/admin/notifications/${job._id}/retry`).set(admin.headers).send({}).expect(200);await request(app).post(`/api/v1/admin/notifications/${job._id}/retry`).set(admin.headers).send({}).expect(409);expect((await model.findById(job._id).lean())!.dedupeKey).toBe(dedupe);expect(await Payment.countDocuments()).toBe(financialBefore);await model.updateOne({_id:job._id},{$set:{state:"failed",payloadExpiresAt:new Date(Date.now()-1000)}});await request(app).post(`/api/v1/admin/notifications/${job._id}/retry`).set(admin.headers).send({}).expect(409);
});
