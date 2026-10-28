import {createIdentityService} from "../../apps/api/src/identity/service.js";
import type {Page} from "@playwright/test";
import sharp from "sharp";
import { createDatabase } from "../../apps/api/src/database.js";
import { createIdentityModels } from "../../apps/api/src/identity/models.js";
import { hashPassword } from "../../apps/api/src/identity/password.js";
import { lagosDate } from "@psycocity/validation";
import { randomUUID } from "node:crypto";
import { mailLink, cleanupMailFixtures } from "./mail";
import { expect, test } from "@playwright/test";

async function seedVerifiedApplicant(email: string, password: string) {
  const uri = process.env.TEST_MONGODB_URI;
  if (!uri || !/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated E2E database required");
  const database = createDatabase(uri);
  try {
    await database.connect();
    await createIdentityModels(database.connection).User.create({ emailNormalized: email, passwordHash: await hashPassword(password), roles: ["applicant"], emailVerifiedAt: new Date() });
  } finally { await database.close(); }
}

test.afterEach(cleanupMailFixtures);

test("registers, delivers verification, signs in and revokes access on logout", async ({ page, context }) => {
  const email = `browser-${randomUUID()}@example.test`;
  const password = "a unique browser test passphrase";
  await page.goto("/applicant/register");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create applicant account" }).click();
  await expect(page.getByRole("status")).toContainText("private email");
  await page.goto(await mailLink(email, "Verify"));
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByRole("status")).toContainText("Email verified");
  await expect(page).not.toHaveURL(/token=/);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email or username").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/applicant\/dashboard/);
  await expect(page.getByRole("main")).toContainText(email);
  await expect(page.getByRole("heading", {level: 2, name: "You’re ready for the first step."})).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.find(cookie => cookie.name === "psycocity_session")?.httpOnly).toBe(true);
  expect(cookies.find(cookie => cookie.name === "psycocity_csrf")?.httpOnly).toBe(false);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/applicant\/login/);
  await page.goto("/applicant/dashboard");
  await expect(page).toHaveURL(/\/applicant\/login/);
});

test("resets a password through delivered mail and rejects the old session", async ({ page, request, context }) => {
  const email = `reset-${randomUUID()}@example.test`;
  const password = "original browser test passphrase";
  const register = await request.post("/api/v1/auth/register", { headers: { Origin: "http://127.0.0.1:3101", "X-Requested-With": "Psycocity" }, data: { email, password } });
  expect(register.status()).toBe(202);
  // Consume only this recipient's local verification message before the reset.
  await mailLink(email, "Verify");
  await page.goto("/applicant/login");
  await page.getByLabel("Email or username").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/applicant\/dashboard/);
  const session = (await context.cookies()).find(cookie => cookie.name === "psycocity_session")!;
  await page.goto("/applicant/forgot-password");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("private email");
  await page.goto(await mailLink(email, "Reset"));
  await page.getByLabel("New password", {exact: true}).fill("replacement browser test passphrase");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  const revoked = await request.get("/api/v1/auth/me", { headers: { Cookie: `psycocity_session=${session.value}` } });
  expect(revoked.status()).toBe(401);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email or username").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("replacement browser test passphrase");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/applicant\/dashboard/);
});

async function verifiedFeatureSession(page:Page,email:string){const uri=process.env.TEST_MONGODB_URI;if(!uri||!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri))throw new Error("Owned test database required");const database=createDatabase(uri);try{await database.connect();const identity=createIdentityService(createIdentityModels(database.connection));const user=(await identity.models.User.findOne({emailNormalized:email,emailVerifiedAt:{$ne:null},roles:"applicant"}).lean())!;expect(user).toBeTruthy();const session=await identity.issueSession(String(user._id));await page.context().addCookies([{name:"psycocity_session",value:session.token,url:"http://127.0.0.1:3101",httpOnly:true,sameSite:"Lax"},{name:"psycocity_csrf",value:session.csrfToken,url:"http://127.0.0.1:3101",sameSite:"Lax"}]);}finally{await database.close();}await page.goto("/applicant/dashboard");}

test("saves and resumes separate track drafts through the application wizard", async ({ page, request }) => {
  const email = `draft-${randomUUID()}@example.test`;
  const password = "a unique application passphrase";
  const headers = { Origin: "http://127.0.0.1:3101", "X-Requested-With": "Psycocity" };
  expect((await request.post("/api/v1/auth/register", { headers, data: { email, password } })).status()).toBe(202);
  const link = new URL(await mailLink(email, "Verify"));
  expect((await request.post("/api/v1/auth/verify-email", { headers, data: { token: link.searchParams.get("token") } })).status()).toBe(200);
  await verifiedFeatureSession(page,email);
  await page.getByRole("button", { name: "Start academy draft" }).click();
  await expect(page).toHaveURL(/\/applicant\/application\/[0-9a-f]{24}$/);
  const academyURL = page.url();
  await page.getByLabel("Legal name", { exact: true }).fill("Sample Applicant");
  await page.getByLabel("Date of birth").fill("2000-01-01");
  await page.getByLabel("Phone number").fill("+2348012345678");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Legal name", { exact: true })).toHaveValue("Sample Applicant");
  await page.getByRole("button", { name: "3. Your professional statistics" }).click();
  await page.getByLabel("Height unit", {exact:true}).selectOption("cm"); await page.getByLabel("Height (cm)", { exact: true }).fill("175");
  await page.getByLabel("Waist (cm)", { exact: true }).fill("70");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.locator("h2[tabindex='-1']")).toHaveText("Your experience and perspective");
  await page.getByRole("button", { name: "6. Photographs", exact: true }).click();
  const picture = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#e7db9d" } }).png().toBuffer();
  await page.getByLabel("Upload headshot", { exact: true }).setInputFiles({ name: "synthetic-headshot.png", mimeType: "image/png", buffer: picture });
  const preview = page.getByRole("img", { name: "Your headshot application photo", exact: true });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  await page.getByRole("link", { name: "Back to your account" }).click();
  await page.getByRole("button", { name: "Start agency draft" }).click();
  await expect(page.getByLabel("Application track")).toHaveValue("established");
  expect(page.url()).not.toBe(academyURL);
  await page.getByRole("button", { name: "5. Your professional background" }).click();
  await page.getByLabel("Previous representation").fill("Independent portfolio");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to your account" }).click();
  await expect(page.getByRole("link", { name: "Open application" })).toHaveCount(2);
});

test("requires a minor’s guardian consent and honors withdrawal", async ({ page, request }) => {
  const email = `minor-${randomUUID()}@example.test`;
  const guardianEmail = `guardian-${randomUUID()}@example.test`;
  const password = "a unique guardian browser passphrase";
  const headers = { Origin: "http://127.0.0.1:3101", "X-Requested-With": "Psycocity" };
  await request.post("/api/v1/auth/register", { headers, data: { email, password } });
  const verification = new URL(await mailLink(email, "Verify"));
  await request.post("/api/v1/auth/verify-email", { headers, data: { token: verification.searchParams.get("token") } });
  await verifiedFeatureSession(page,email);
  await page.getByRole("button", { name: "Start academy draft" }).click();
  await expect(page).toHaveURL(/\/applicant\/application\/[0-9a-f]{24}$/);
  const applicationURL = page.url();
  await page.getByLabel("Legal name", { exact: true }).fill("Sample Minor");
  await page.getByLabel("Date of birth").fill(`${Number(lagosDate().slice(0, 4)) - 17}-01-01`);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "6. Photographs", exact: true }).click();
  await expect(page.getByLabel("Upload headshot", { exact: true })).toHaveCount(0);
  await page.getByLabel("Guardian’s full name").fill("Sample Guardian");
  await page.getByLabel("Guardian’s email address").fill(guardianEmail);
  await page.getByLabel("Relationship", { exact: true }).selectOption("parent");
  await page.getByRole("button", { name: "Send guardian request" }).click();
  await expect(page.getByText("A private consent request has been queued", { exact: false })).toBeVisible();
  await page.goto(await mailLink(guardianEmail, "Guardian consent for"));
  await page.getByRole("checkbox", { name: /I am at least 18/ }).check();
  await page.getByRole("checkbox", { name: /I have read the privacy information/ }).check();
  await page.getByRole("button", { name: "Record my consent" }).click();
  await expect(page.getByRole("status")).toContainText("Guardian consent recorded");
  await expect(page).not.toHaveURL(/token=/);
  await page.goto(applicationURL); await page.getByRole("button", { name: "6. Photographs", exact: true }).click();
  await expect(page.getByLabel("Upload headshot", { exact: true })).toBeVisible();
  await page.goto(await mailLink(guardianEmail, "guardian consent record"));
  await page.getByRole("button", { name: "Withdraw consent", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Consent withdrawn");
  await page.goto(applicationURL); await page.getByRole("button", { name: "6. Photographs", exact: true }).click();
  await expect(page.getByText("Photo collection is paused.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Upload headshot", { exact: true })).toHaveCount(0);
});

for (const track of ["academy", "established"] as const) test(`submits a complete ${track} application without payment`, async ({ page }) => {
  const email = `submission-${randomUUID()}@example.test`;
  const password = "a unique submission passphrase";
  // Signup itself is covered above. Seed this suite-owned verified account so
  // complete submission journeys do not exhaust genuine signup abuse limits.
  await seedVerifiedApplicant(email, password);
  await page.goto("/applicant/login"); await page.getByLabel("Email or username").fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: track === "academy" ? "Start academy draft" : "Start agency draft", exact: true }).click();
  await expect(page).toHaveURL(/\/applicant\/application\/[0-9a-f]{24}$/);
  await page.getByLabel("Legal name", { exact: true }).fill("Sample Applicant"); await page.getByLabel("Date of birth").fill("2000-01-01"); await page.getByLabel("Phone number").fill("08012345678");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByLabel("Country", { exact: true }).selectOption("Nigeria"); await page.getByLabel("State or FCT").selectOption("Lagos"); await page.getByLabel("City", { exact: true }).fill("Ikeja");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByLabel("Height unit", {exact:true}).selectOption("cm"); await page.getByLabel("Height (cm)", { exact: true }).fill("175"); await page.getByLabel(/^Shoe size \(/).fill("40"); await page.getByLabel("Shoe sizing system").selectOption("EU");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByLabel("Tell us about yourself").fill("I am ready to develop my modelling craft and professional confidence."); await page.getByLabel("Modelling experience").fill("I have worked on independent fashion projects."); await page.getByLabel("Modelling interests").fill("Editorial and runway"); await page.getByLabel("Availability", { exact: true }).fill("Weekends");
  await page.getByRole("button", { name: "Save and continue" }).click();
  if (track === "academy") { await page.getByLabel("What would you like to learn?").fill("Develop my runway and professional portfolio skills"); await page.getByLabel("Availability for in-person and online sessions").fill("Weekends in Lagos and online"); }
  else { await page.getByLabel("Previous representation").fill("Independent"); await page.getByLabel("Current contractual restrictions").fill("None"); }
  await page.getByRole("button", { name: "Save and continue" }).click();
  const image = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#e7db9d" } }).png().toBuffer();
  for (const view of ["headshot", "side profile", "full-body front", "full-body side"]) {
    await expect(page.getByLabel(`Upload ${view}`, { exact: true })).toBeEnabled();
    await page.getByLabel(`Upload ${view}`, { exact: true }).setInputFiles({ name: `${view.replaceAll(" ", "-")}.png`, mimeType: "image/png", buffer: image });
    await expect(page.getByRole("img", { name: `Your ${view} application photo`, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(page.getByText("Your saved application meets the submission requirements.", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /I confirm my details and photographs/ }).check(); await page.getByRole("checkbox", { name: /I have read and accept the application terms/ }).check(); await page.getByRole("checkbox", { name: /I have read the privacy notice and agree/ }).check();
  await page.getByRole("button", { name: "Submit application — no payment", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Application received.");
  await expect(page.getByText("Application received for assessment. No payment is due before acceptance.", { exact: true })).toBeVisible();
  expect(new URL(await mailLink(email, "application is received")).pathname).toBe("/applicant/dashboard");
  await page.reload(); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Application received.");
  await expect(page.getByLabel("Legal name", { exact: true })).toHaveCount(0);
});
