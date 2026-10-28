import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";
import request from "supertest";
import { seedDemo, validateDemoEnvironment, demoAccounts, demoPassword } from "./seed-demo.mjs";
import { createDatabase } from "../apps/api/dist/database.js";
import { createApp } from "../apps/api/dist/app.js";
import { safeErrorHandler } from "../apps/api/dist/errors.js";
import { createIdentityModels } from "../apps/api/dist/identity/models.js";
import { createIdentityService } from "../apps/api/dist/identity/service.js";
import { readAuthConfig } from "../apps/api/dist/identity/config.js";
import { createMailRuntime } from "../apps/api/dist/mail/runtime.js";
import { loadOutboxKey } from "../apps/api/dist/mail/crypto.js";
import { createAdminService } from "../apps/api/dist/admin/service.js";
import { createMediaModel } from "../apps/api/dist/media/models.js";
import { localPrivateStorage } from "../apps/api/dist/media/storage.js";
const env={NODE_ENV:"development",EMAIL_TRANSPORT:"local",STORAGE_DRIVER:"local",APP_ORIGIN:"http://localhost:5173",MONGODB_URI:`mongodb://127.0.0.1:27018/psycocity_demo_${randomBytes(8).toString("hex")}_test?replicaSet=rs0&directConnection=true`};
for(const invalid of [{NODE_ENV:"production"},{DEPLOYMENT_STAGE:"staging"},{PAYSTACK_SECRET_KEY:"sk_test_fixture"},{EMAIL_TRANSPORT:"resend"},{STORAGE_DRIVER:"cloudinary"},{MONGODB_URI:"mongodb://127.0.0.1:27017/psycocity?replicaSet=rs0&directConnection=true"},{APP_ORIGIN:"https://example.test"}])assert.throws(()=>validateDemoEnvironment({...env,...invalid}));
const database=createDatabase(env.MONGODB_URI);const storage=localPrivateStorage("development");let complete=false;
try{
 const first=await seedDemo(env);assert.equal(first.created,true);
 await database.connect();const identity=createIdentityService(createIdentityModels(database.connection));const mail=await createMailRuntime(database.connection,env,"development");const key=await loadOutboxKey("development");const app=createApp({identityService:identity,authConfig:readAuthConfig(env,"development"),mail,adminKey:key,storage});app.use(safeErrorHandler);
 for(const [role,email]of Object.entries(demoAccounts)){
  const login=await request(app).post("/api/v1/auth/login").set({Origin:env.APP_ORIGIN,"X-Requested-With":"Psycocity"}).send({identifier:email,password:demoPassword});assert.equal(login.status,200,`${role} login`);const cookie=login.headers["set-cookie"].map(value=>value.split(";")[0]).join("; ");
  if(role==="student"||role==="model"){assert.equal((await request(app).get(`/api/v1/member/${role}`).set("Cookie",cookie)).status,200);assert.equal((await request(app).get(`/api/v1/member/${role==="model"?"student":"model"}`).set("Cookie",cookie)).status,403);}
  if(role==="applicant"){assert.equal((await request(app).get("/api/v1/member/student").set("Cookie",cookie)).status,403);assert.equal((await request(app).get("/api/v1/applications").set("Cookie",cookie)).status,200);}
  if(role==="admin"){
   assert.equal(login.body.mfaRequired,true);assert.equal((await request(app).get("/api/v1/admin/overview").set("Cookie",cookie)).status,403);
   const token=cookie.match(/psycocity_session=([^;]+)/)[1];const actor=await identity.authenticate(token);const service=createAdminService(identity,mail,key,env.APP_ORIGIN);const setup=await service.enroll(actor);assert.ok(setup);const verification=await service.verifyMfa(actor,"totp",new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(setup.secret),algorithm:"SHA1",digits:6,period:30}).generate());assert.ok(verification);assert.equal((await request(app).get("/api/v1/admin/overview").set("Cookie",`psycocity_session=${verification.session.token}`)).status,200);
  }
 }
 const before=await identity.models.User.findOne({emailNormalized:demoAccounts.admin}).select("+mfaSecretEncrypted").lean();assert.equal((await seedDemo(env)).created,false);const after=await identity.models.User.findById(before._id).select("+mfaSecretEncrypted").lean();assert.equal(after.mfaSecretEncrypted,before.mfaSecretEncrypted);assert.equal(await identity.models.User.countDocuments(),4);
 console.log("PASS: four demo logins, student/model separation, MFA enforcement and enrollment, safe rerun, and production/provider/database guards");complete=true;
}finally{
 try {if(database.connection.readyState===0)await database.connect();const Media=createMediaModel(database.connection);for(const row of await Media.find().select("storageKey").lean())await storage.remove(row.storageKey);await database.connection.dropDatabase();}catch{console.error("Demo cleanup could not connect to the isolated test database");process.exitCode=1;}finally{await database.close();}
 if(!complete)process.exitCode=1;
}
