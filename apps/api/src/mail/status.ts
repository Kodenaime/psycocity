import { emailSchema } from "@psycocity/validation";
import { createIdentityModels } from "../identity/models.js";
import { readConfig } from "../config.js";
import { readAuthConfig } from "../identity/config.js";
import { createDatabase } from "../database.js";
import { createOutboxModel } from "./models.js";
const config = readConfig(process.env);
const database = createDatabase(config.mongoUri);
try {
  await database.connect();
  const transport = process.env.EMAIL_TRANSPORT ?? (config.mode === "production" ? "disabled" : "local");
  console.log(`Email transport: ${["local","resend","disabled"].includes(transport)?transport:"invalid"}`);
  console.log(`Database: ${database.connection.name}`);
  console.log(`Application origin: ${readAuthConfig(process.env,config.mode).origin}`);
  console.log(`Resend key configured: ${Boolean(process.env.RESEND_API_KEY)}; sender configured: ${Boolean(process.env.EMAIL_FROM)}`);
  const args=process.argv.slice(2);
  if(args.includes("--email")){
    const email=emailSchema.safeParse(args[args.indexOf("--email")+1]);
    if(!email.success)throw new Error("Invalid email option");
    const models=createIdentityModels(database.connection);
    const user=await models.User.findOne({emailNormalized:email.data}).select("emailVerifiedAt status").lean();
    console.log(`Requested account exists in this database: ${Boolean(user)}; verified: ${Boolean(user?.emailVerifiedAt)}`);
    if(user)console.log(`Unexpired unused verification links: ${await models.AuthToken.countDocuments({userId:user._id,purpose:"email_verification",consumedAt:null,expiresAt:{$gt:new Date()}})}`);
  }
  const jobs = createOutboxModel(database.connection);
  const counts = await Promise.all((["pending","processing","delivered","failed"] as const).map(async state=>({state,count:await jobs.countDocuments({state})})));
  console.table(counts);
  const recent = await jobs.find().sort({_id:-1}).limit(10).select("state attempts lastErrorCode createdAt").lean();
  console.table(recent.map(job=>({createdAt:job.createdAt.toISOString(),state:job.state,attempts:job.attempts,error:job.lastErrorCode??"none"})));
  console.log("Read-only status. Recipients, message bodies, private links and secrets are omitted. The worker must be running separately.");
} catch { console.error("Email status unavailable. Check the selected database and configuration; no credentials were printed.");process.exitCode=1; }
finally {await database.close();}
