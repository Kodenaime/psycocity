import { randomUUID } from "node:crypto";
import type { Browser } from "@playwright/test";
import * as OTPAuth from "otpauth";
import { createDatabase } from "../../apps/api/src/database.js";
import { createIdentityModels } from "../../apps/api/src/identity/models.js";
import { createIdentityService } from "../../apps/api/src/identity/service.js";
import { hashPassword } from "../../apps/api/src/identity/password.js";
import { createMailRuntime } from "../../apps/api/src/mail/runtime.js";
import { loadOutboxKey } from "../../apps/api/src/mail/crypto.js";
import { createAdminService } from "../../apps/api/src/admin/service.js";
export async function staffContext(browser: Browser) {
  const uri = process.env.TEST_MONGODB_URI; if (!uri || !/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated E2E database required");
  const database = createDatabase(uri); const email = `portfolio-staff-${randomUUID()}@example.test`; let session;
  try {await database.connect(); const identity = createIdentityService(createIdentityModels(database.connection)); const user = await identity.models.User.create({emailNormalized: email, passwordHash: await hashPassword("feature fixture staff passphrase"), roles: ["admin"], staffStatus: "active", emailVerifiedAt: new Date()}); const pending = await identity.issueSession(String(user._id)); const actor = (await identity.authenticate(pending.token))!; const mail = await createMailRuntime(database.connection, {...process.env, EMAIL_TRANSPORT: "local"}, "test"); const service = createAdminService(identity, mail, await loadOutboxKey("test", process.env.OUTBOX_ENCRYPTION_KEY), "http://127.0.0.1:3101"); const setup = (await service.enroll(actor))!; session = (await service.verifyMfa(actor, "totp", new OTPAuth.TOTP({secret: OTPAuth.Secret.fromBase32(setup.secret), algorithm: "SHA1", digits: 6, period: 30}).generate()))!.session;} finally {await database.close();}
  const context = await browser.newContext(); await context.addCookies([{name: "psycocity_session", value: session.token, url: "http://127.0.0.1:3101", httpOnly: true, sameSite: "Lax"}, {name: "psycocity_csrf", value: session.csrfToken, url: "http://127.0.0.1:3101", sameSite: "Lax"}]); return {context, email};
}
