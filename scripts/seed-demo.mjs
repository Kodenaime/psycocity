// Explicit local sandbox fixtures. Never imported by a server or worker.
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import request from "supertest";
import sharp from "sharp";
import { applicationPrivacyVersion, applicationTermsVersion, admissionTermsText, admissionTermsVersion } from "@psycocity/validation";
import { createDatabase } from "../apps/api/dist/database.js";
import { createApp } from "../apps/api/dist/app.js";
import { safeErrorHandler } from "../apps/api/dist/errors.js";
import { readAuthConfig } from "../apps/api/dist/identity/config.js";
import { createIdentityModels } from "../apps/api/dist/identity/models.js";
import { createIdentityService } from "../apps/api/dist/identity/service.js";
import { hashPassword } from "../apps/api/dist/identity/password.js";
import { createMailRuntime } from "../apps/api/dist/mail/runtime.js";
import { loadOutboxKey, decryptPayload } from "../apps/api/dist/mail/crypto.js";
import { localPrivateStorage } from "../apps/api/dist/media/storage.js";
import { createAdminService } from "../apps/api/dist/admin/service.js";
import { createApplicationModels } from "../apps/api/dist/applications/models.js";
import { createOfferModel } from "../apps/api/dist/offers/models.js";
import { createPaymentModel } from "../apps/api/dist/payments/models.js";
import { createSettlementService } from "../apps/api/dist/payments/settlement.js";
import { createMembershipService } from "../apps/api/dist/members/service.js";

export const demoPassword = "Psycocity demo passphrase 2026!";
export const demoAccounts = {applicant:"applicant@psycocity.test",student:"student@psycocity.test",model:"model@psycocity.test",admin:"admin@psycocity.test"};
export function validateDemoEnvironment(env) {
  if (env.NODE_ENV !== "development" || env.DEPLOYMENT_STAGE || env.PAYSTACK_SECRET_KEY || env.EMAIL_TRANSPORT !== "local" || env.STORAGE_DRIVER !== "local") throw new Error("Demo setup requires development mode, local email/storage, no deployment stage and no Paystack key");
  let uri;
  try {uri = new URL(env.MONGODB_URI);} catch {throw new Error("Set the dedicated local demo MONGODB_URI first");}
  if (uri.protocol !== "mongodb:" || uri.hostname !== "127.0.0.1" || !["27017","27018"].includes(uri.port) || uri.username || uri.password || !/^\/psycocity_demo(?:_[0-9a-f]{16})?_test$/.test(uri.pathname) || uri.searchParams.get("replicaSet") !== "rs0" || uri.searchParams.get("directConnection") !== "true") throw new Error("Demo setup only accepts a dedicated psycocity_demo_test database on the local replica set");
  if (env.APP_ORIGIN !== "http://localhost:5173") throw new Error("Demo setup requires APP_ORIGIN=http://localhost:5173");
  if (!readAuthConfig(env,"development").registrationEnabled) throw new Error("Enable local synthetic registration before seeding demo accounts");
  return env.MONGODB_URI;
}

export async function seedDemo(env) {
  const uri = validateDemoEnvironment(env);
  const database = createDatabase(uri);
  try {
    await database.connect();
    const connection = database.connection;
    const identity = createIdentityService(createIdentityModels(connection));
    const key = await loadOutboxKey("development",env.OUTBOX_ENCRYPTION_KEY);
    const mail = await createMailRuntime(connection,env,"development");
    const admin = createAdminService(identity,mail,key,env.APP_ORIGIN);
    const app = createApp({identityService:identity,authConfig:readAuthConfig(env,"development"),mail,adminKey:key,storage:localPrivateStorage("development")});
    app.use(safeErrorHandler);
    for (const model of Object.values(connection.models)) await model.createIndexes();
    const {Setting,Audit} = admin.models;
    const marker = await Setting.findOne({key:"local-demo-setup-v1"}).lean();
    if (marker?.value?.state === "complete") return {created:false,accounts:demoAccounts};
    if (marker || await identity.models.User.exists({})) throw new Error("Demo database is not empty or setup was interrupted. Existing accounts were not modified");
    await Setting.create({key:"local-demo-setup-v1",value:{state:"building",synthetic:true}});
    const extractToken = async dedupeKey => {
      const job = await mail.model.findOne({dedupeKey}).select("+encryptedPayload").lean();
      if (!job?.encryptedPayload) throw new Error("Demo invitation payload unavailable");
      const payload = decryptPayload(job.encryptedPayload,key);
      const link = payload.text.match(/http:\/\/localhost:5173\/\S+/)?.[0];
      if (!link) throw new Error("Demo invitation link unavailable");
      return new URL(link).searchParams.get("token");
    };
    await admin.bootstrap(demoAccounts.admin);
    const staffInvitation = await admin.models.Invite.findOne({email:demoAccounts.admin,status:"pending"}).lean();
    if (!await admin.activate(await extractToken(`staff-invitation:${staffInvitation._id}`),demoPassword)) throw new Error("Demo staff activation failed");
    const staff = await identity.models.User.findOne({emailNormalized:demoAccounts.admin}).lean();
    const passwordHash = await hashPassword(demoPassword);
    const image = await sharp({create:{width:320,height:480,channels:3,background:"#e7db9d"}}).png().toBuffer();
    const answers = name => ({personal:{legalName:name,birthDate:"2000-01-01",phone:"08012345678"},location:{country:"Nigeria",state:"Lagos",city:"Ikeja"},measurements:{heightCm:175,waistCm:70,shoeSize:40,shoeSystem:"EU"},background:{introduction:"DEMO ONLY: practising modelling, editorial expression and professional confidence.",interests:"Editorial and runway",availability:"Weekends",experience:"Synthetic sample experience for local testing only."},academy:{learningGoals:"Develop runway technique and professional confidence",hybridAvailability:"Available for weekend studio and online sessions"},established:{representationHistory:"Independent demo fixture",contractualRestrictions:"None — synthetic sample"}});
    const expectStatus = (response,status) => {if(response.status!==status) throw new Error(`Demo workflow failed (${response.status}, expected ${status})`);return response.body;};
    for (const [type,track] of [["applicant","academy"],["student","academy"],["model","established"]]) {
      const user = await identity.models.User.create({emailNormalized:demoAccounts[type],passwordHash,emailVerifiedAt:new Date(),roles:["applicant"]});
      const session = await identity.issueSession(String(user._id));
      const headers = {Origin:env.APP_ORIGIN,"X-Requested-With":"Psycocity",Cookie:`psycocity_session=${session.token}`,"X-CSRF-Token":session.csrfToken};
      const created = expectStatus(await request(app).post("/api/v1/applications").set(headers).send({track}),201);
      const id = created.id;
      expectStatus(await request(app).patch(`/api/v1/applications/${id}`).set(headers).send({version:0,answers:answers(`DEMO ${type}`)}),200);
      for (const slot of ["headshot","profile","full_body_front","full_body_side"]) {
        const grant = expectStatus(await request(app).post("/api/v1/media/uploads").set(headers).send({applicationId:id,slot}),201);
        expectStatus(await request(app).put(grant.uploadUrl).set({...headers,"X-Upload-Token":grant.uploadToken,"Content-Type":"image/png"}).send(image),200);
      }
      const submitted = expectStatus(await request(app).post(`/api/v1/applications/${id}/submit`).set(headers).send({version:1,declarations:{accuracy:true,termsAccepted:true,privacyAccepted:true,termsVersion:applicationTermsVersion,privacyVersion:applicationPrivacyVersion}}),200);
      if (type === "applicant") continue;
      // Construct synthetic acceptance/provider evidence only inside this explicitly isolated sandbox.
      await createApplicationModels(connection).Application.updateOne({_id:id},{$set:{status:"accepted"}});
      const offer = await createOfferModel(connection).create({applicationId:id,ownerId:user._id,track,amountKobo:track==="academy"?5_000_000:3_000_000,currency:"NGN",termsVersion:admissionTermsVersion,termsText:admissionTermsText,expiresAt:new Date(Date.now()+86400000),issuedBy:staff._id,revision:1,applicationVersion:submitted.version});
      const reference = `psyc_${randomBytes(20).toString("hex")}`;
      const payment = await createPaymentModel(connection).create({offerId:offer._id,applicationId:id,ownerId:user._id,reference,amountKobo:offer.amountKobo,currency:"NGN",termsVersion:offer.termsVersion,termsAcceptedAt:new Date(),state:"initialized",initializationExpiresAt:new Date()});
      const settlement = createSettlementService(identity,{validSignature:()=>false,verify:async()=>({id:BigInt(`0x${randomBytes(10).toString("hex")}`).toString(),reference,status:"success",amount:offer.amountKobo,currency:"NGN",domain:"test",paid_at:new Date().toISOString(),customer:{email:demoAccounts[type]},metadata:{applicationId:id,offerId:String(offer._id)}})},mail,env.APP_ORIGIN);
      if (!await settlement.runOnce(reference)) throw new Error("Synthetic demo settlement failed");
      const memberships = createMembershipService(identity,mail,env.APP_ORIGIN);
      const entitlementId = await memberships.ensure(payment._id);
      const invitation = await memberships.models.Invitation.findOne({entitlementId,status:"pending"}).lean();
      if (!invitation || !await memberships.activate({email:demoAccounts[type],password:demoPassword,token:await extractToken(`member-invitation:${invitation._id}`),username:`demo_${type}`})) throw new Error("Demo member activation failed");
    }
    await Audit.create({actorId:staff._id,action:"local_demo.synthetic_setup",summary:{synthetic:true,noMoneyCollected:true,noExternalProviderCalls:true}});
    await identity.models.Session.updateMany({revokedAt:null},{$set:{revokedAt:new Date()}});
    await Setting.updateOne({key:"local-demo-setup-v1"},{$set:{value:{state:"complete",synthetic:true}}});
    return {created:true,accounts:demoAccounts};
  } finally {await database.close();}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await seedDemo(process.env);
    console.log(result.created?"Created isolated local demo accounts. Payments are simulated; no money was collected.":"Existing demo setup retained. Password changes and MFA enrollment were preserved.");
    console.table(Object.entries(result.accounts).map(([role,email])=>({role,email})));
    console.log("Initial sample password: Psycocity demo passphrase 2026!\nAdmin must enroll an authenticator on first login. See docs/local-testing.md.");
  } catch (error) {console.error(error instanceof Error?error.message:"Local demo setup failed");process.exitCode=1;}
}
