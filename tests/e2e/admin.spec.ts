import { createIdentityService } from "../../apps/api/src/identity/service.js";
import { randomUUID } from "node:crypto";
import * as OTPAuth from "otpauth";
import { expect, test, type Page } from "@playwright/test";
import { createDatabase } from "../../apps/api/src/database.js";
import { createIdentityModels } from "../../apps/api/src/identity/models.js";
import { hashPassword } from "../../apps/api/src/identity/password.js";
import { mailLink, cleanupMailFixtures } from "./mail";

async function seedInitialStaff(email: string, password: string, pendingSession = false) {
  const uri = process.env.TEST_MONGODB_URI;
  if (!uri || !/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]*_test(?:\?|$)/.test(uri)) throw new Error("Dedicated E2E database required");
  const database = createDatabase(uri);
  try {
    await database.connect();
    const models = createIdentityModels(database.connection);
    const user = await models.User.create({ emailNormalized: email, passwordHash: await hashPassword(password), roles: ["admin"], staffStatus: "active", emailVerifiedAt: new Date() });
    if (pendingSession) return await createIdentityService(models).issueSession(String(user._id));
  } finally { await database.close(); }
}
async function enroll(page: Page) {
  await page.getByRole("button", { name: "Set up authenticator", exact: true }).click();
  const secret = (await page.getByTestId("mfa-setup-key").textContent())!.trim();
  const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), algorithm: "SHA1", digits: 6, period: 30 }).generate();
  await page.getByLabel("Authenticator code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
  await expect(page.getByTestId("mfa-recovery-code")).toHaveCount(10);
  const codes = await page.getByTestId("mfa-recovery-code").allTextContents();
  await page.getByRole("checkbox", { name: "I have stored my recovery codes securely." }).check();
  await page.getByRole("button", { name: "Continue to administration" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Agency overview." })).toBeVisible();
  return codes;
}
async function fixtureStaffSession(page: Page, email: string, password: string) {
  // Password login is covered by the staff-security journey. These feature
  // fixtures still complete real MFA and retain all production abuse limits.
  const session = (await seedInitialStaff(email, password, true))!;
  await page.context().addCookies([{name: "psycocity_session", value: session.token, url: "http://127.0.0.1:3101", httpOnly: true, sameSite: "Lax"}, {name: "psycocity_csrf", value: session.csrfToken, url: "http://127.0.0.1:3101", httpOnly: false, sameSite: "Lax"}]);
  await page.goto("/admin/mfa"); await enroll(page);
}
test.afterEach(cleanupMailFixtures);

test("enforces staff MFA, invitations, equal access, revocation and audited recovery", async ({ page, browser }) => {
  const email = `initial-staff-${randomUUID()}@example.test`;
  const secondEmail = `invited-staff-${randomUUID()}@example.test`;
  const password = "a unique staff browser passphrase";
  await seedInitialStaff(email, password);
  await page.goto("/admin/login");
  await page.getByLabel("Email or username").fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  const codes = await enroll(page);
  await page.getByRole("link", { name: "Staff access", exact: true }).click();
  const ownRow = page.getByRole("row").filter({ hasText: email });
  // This project's fixture may coexist with a previous project's secured admin;
  // the API-level suite independently verifies the exact last-admin invariant.
  await expect(ownRow).toBeVisible();
  await page.getByLabel("Staff email address").fill(secondEmail);
  await page.getByRole("button", { name: "Send staff invitation", exact: true }).click();
  await expect(page.getByText("Private staff invitation queued", { exact: true })).toBeVisible();
  const invitation = await mailLink(secondEmail, "staff invitation");
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage(); await other.goto(invitation);
    await other.getByLabel("Account password").fill(password);
    await other.getByRole("button", { name: "Accept staff invitation", exact: true }).click();
    await expect(other).toHaveURL(/\/admin\/mfa$/); await enroll(other);
    await other.getByRole("link", { name: "Staff access", exact: true }).click();
    await expect(other.getByRole("heading", { name: "Staff access." })).toBeVisible();
    await other.getByRole("link", { name: "Audit history", exact: true }).click();
    await expect(other.getByRole("heading", { name: "Audit history." })).toBeVisible();
    await page.getByRole("button", { name: "Refresh staff", exact: true }).click();
    const target = page.getByRole("row").filter({ hasText: secondEmail }).getByRole("button", { name: "Deactivate staff access", exact: true });
    await expect(target).toBeEnabled(); page.once("dialog", dialog => dialog.accept()); await target.click();
    await expect(page.getByRole("row").filter({ hasText: secondEmail }).getByText("Deactivated", { exact: true })).toBeVisible();
    await other.goto("http://127.0.0.1:3101/admin"); await expect(other).toHaveURL(/\/admin\/login$/);
  } finally { await otherContext.close(); }
  await page.getByRole("link", { name: "Audit history", exact: true }).click();
  await expect(page.getByText("staff — deactivated", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Verify security", exact: true }).click();
  await page.getByLabel("Verification method").selectOption("recovery");
  await page.getByLabel("Recovery code", { exact: true }).fill(codes[0]!);
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("reviews a submitted application and completes scoped applicant corrections", async ({ page, request, browser }) => {
  const { submittedApplicant } = await import("./fixtures"); const applicant = await submittedApplicant(request);
  const email = `review-staff-${randomUUID()}@example.test`; const password = "staff review browser passphrase";
  await fixtureStaffSession(page, email, password);
  await page.getByRole("link", {name: "Admissions", exact: true}).click();
  await page.getByRole("row").filter({hasText: applicant.name}).getByRole("link", {name: "Review application"}).click();
  await expect(page.getByRole("heading", {name: applicant.name})).toBeVisible();
  await expect(page.locator(".photo-card img")).toHaveCount(4);
  await page.getByRole("button", {name: "Start review", exact: true}).click(); await expect(page.getByRole("button", {name: "Start review", exact: true})).toBeDisabled();
  await page.getByRole("checkbox", {name: "personal / phone", exact: true}).check();
  await page.getByLabel("Applicant instructions (visible to the applicant)").fill("Please provide your updated phone number.");
  await page.getByLabel("Optional internal note (staff only)").fill("Private staff observation for review");
  await page.getByRole("button", {name: "Send correction request", exact: true}).click();
  await expect(page.getByText("Review action recorded", {exact: true})).toBeVisible();
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage(); await other.goto("http://127.0.0.1:3101/applicant/login");
    await other.getByLabel("Email or username").fill(applicant.email); await other.getByLabel("Password", {exact: true}).fill(applicant.password); await other.getByRole("button", {name: "Sign in", exact: true}).click();
    await expect(other).toHaveURL(/\/applicant\/dashboard$/);
    await other.goto(`http://127.0.0.1:3101/applicant/application/${applicant.id}`);
    await expect(other.getByRole("heading", {name: "A few updates."})).toBeVisible();
    await expect(other.getByLabel("Legal name", {exact: true})).toBeDisabled();
    await other.getByLabel("Phone number", {exact: true}).fill("08098765432"); await other.getByRole("button", {name: "Save draft", exact: true}).click();
    await other.getByRole("button", {name: /^7\. Review draft/}).click();
    await other.getByRole("checkbox", {name: "I confirm my details and photographs are accurate and current."}).check();
    await other.getByRole("checkbox", {name: "I have read and accept the application terms."}).check();
    await other.getByRole("checkbox", {name: "I have read the privacy notice and agree to processing for this application."}).check();
    await other.getByRole("button", {name: "Submit application — no payment", exact: true}).click();
    await expect(other.getByRole("heading", {name: "Application received."})).toBeVisible();
    await expect(other.getByText("Private staff observation for review", {exact: true})).toHaveCount(0);
  } finally { await otherContext.close(); }
  await page.getByRole("button", {name: "Refresh application", exact: true}).click();
  await expect(page.getByText("+2348098765432", {exact: false})).toBeVisible();
  await expect(page.getByRole("paragraph").filter({hasText: "Private staff observation for review"})).toBeVisible();
  await page.getByRole("button", {name: "Start review", exact: true}).click();
  await expect(page.getByRole("button", {name: "Start review", exact: true})).toBeDisabled();
  await page.getByRole("button", {name: "Record assessment completed", exact: true}).click();
  await expect(page.getByRole("button", {name: "Record admission decision", exact: true})).toBeVisible();
  await page.getByLabel("Admission decision", {exact: true}).selectOption("waitlist");
  await page.getByLabel("Decision reason (visible to applicant)").fill("We are holding your assessed application for the next intake.");
  await page.getByRole("button", {name: "Record admission decision", exact: true}).click();
  await expect(page.getByText("Admission decision recorded", {exact: true})).toBeVisible();
  await page.getByLabel("Admission decision", {exact: true}).selectOption("accept");
  await page.getByLabel("Decision reason (visible to applicant)").fill("Your assessed application is accepted for the academy intake.");
  await page.getByLabel("Offer deadline (days; default 14)").fill("7");
  await page.getByRole("button", {name: "Record admission decision", exact: true}).click();
  await expect(page.getByRole("heading", {name: /₦50,000/})).toBeVisible();
  const offerContext = await browser.newContext();
  try {
    const owner = await offerContext.newPage(); await owner.goto("http://127.0.0.1:3101/applicant/login");
    await owner.getByLabel("Email or username").fill(applicant.email); await owner.getByLabel("Password", {exact: true}).fill(applicant.password); await owner.getByRole("button", {name: "Sign in", exact: true}).click(); await expect(owner).toHaveURL(/\/applicant\/dashboard$/);
    await owner.goto(`http://127.0.0.1:3101/applicant/application/${applicant.id}`);
    await expect(owner.getByRole("heading", {name: /₦50,000/})).toBeVisible();
    await expect(owner.getByText(/Online checkout is not available yet/)).toBeVisible();
    await expect(owner.getByRole("button", {name: /Pay/})).toHaveCount(0);
    await owner.goto(`http://127.0.0.1:3101/applicant/payment-return?reference=psyc_${"0".repeat(40)}&status=success`);
    await expect(owner.getByText(/Payment not found/)).toBeVisible();
    await expect(owner.getByText(/Payment verification recorded/)).toHaveCount(0);
  } finally {await offerContext.close();}

});

test("assigns admission slots, receives an RSVP and cancels the appointment", async ({page, request, browser}) => {
  const {submittedApplicant} = await import("./fixtures"); const applicant = await submittedApplicant(request);
  const email = `schedule-staff-${randomUUID()}@example.test`; const password = "scheduling staff browser passphrase"; await fixtureStaffSession(page, email, password);
  await page.getByRole("link", {name: "Appointments", exact: true}).click();
  const title = `Admission session ${randomUUID().slice(0,8)}`;
  const start = Date.now() + 30 * 24 * 60 * 60_000;
  const wat = (minutes: number) => new Date(start + (minutes + 60) * 60_000).toISOString().slice(0,16);
  await page.getByLabel("Event title", {exact: true}).fill(title); await page.getByLabel("Description", {exact: true}).fill("Private admission session for academy applicants.");
  await page.getByLabel("Delivery mode", {exact: true}).selectOption("online"); await page.getByLabel("Private HTTPS meeting link", {exact: true}).fill("https://example.test/private-admission");
  await page.getByLabel("Event starts (WAT)", {exact: true}).fill(wat(0)); await page.getByLabel("Event ends (WAT)", {exact: true}).fill(wat(120));
  await page.getByRole("button", {name: "Create event", exact: true}).click(); await expect(page.getByText(title, {exact: true})).toBeVisible();
  await page.goto(`/admin/applications/${applicant.id}`); await page.getByRole("button", {name: "Start review", exact: true}).click();
  await expect(page.getByRole("button", {name: "Start review", exact: true})).toBeDisabled();
  const option = page.getByLabel("Admission event", {exact: true}).locator("option").filter({hasText: title});
  await page.getByLabel("Admission event", {exact: true}).selectOption(await option.getAttribute("value") ?? "");
  await page.getByLabel("Assigned slot starts (WAT)", {exact: true}).fill(wat(15)); await page.getByLabel("Assigned slot ends (WAT)", {exact: true}).fill(wat(30));
  await page.getByRole("button", {name: "Assign slot and email applicant", exact: true}).click(); await expect(page.getByText("Admission schedule updated", {exact: true})).toBeVisible();
  const context = await browser.newContext();
  try {
    const other = await context.newPage(); await other.goto("http://127.0.0.1:3101/applicant/login"); await other.getByLabel("Email or username").fill(applicant.email); await other.getByLabel("Password", {exact: true}).fill(applicant.password); await other.getByRole("button", {name: "Sign in", exact: true}).click(); await expect(other).toHaveURL(/\/applicant\/dashboard$/);
    await expect(other.getByRole("heading", {name: title})).toBeVisible(); await expect(other.getByRole("link", {name: "Private meeting link"})).toHaveAttribute("href", "https://example.test/private-admission");
    await other.getByRole("button", {name: "Confirm attendance", exact: true}).click(); await expect(other.getByText("RSVP saved", {exact: true})).toBeVisible();
    await page.getByRole("link", {name: "Appointments", exact: true}).click(); await page.locator("li").filter({hasText: title}).getByRole("button", {name: "Edit event", exact: true}).click();
    await page.getByRole("checkbox", {name: "Cancel this event and all active invitations"}).check(); await page.getByRole("button", {name: "Save event changes", exact: true}).click(); await expect(page.getByText("Admission schedule updated", {exact: true})).toBeVisible();
    await other.reload(); await expect(other.getByText(/Cancelled · RSVP: confirmed/)).toBeVisible(); await expect(other.getByRole("link", {name: "Private meeting link"})).toHaveCount(0);
  } finally {await context.close();}
});

test("shows verified test receipts privately to the payer and the staff reconciliation screen", async ({page, request, browser}) => {
  const {settledPayment} = await import("./fixtures"); const payer = await settledPayment(request);
  const email = `payment-staff-${randomUUID()}@example.test`; const password = "payment staff browser passphrase"; await fixtureStaffSession(page, email, password);
  await page.getByRole("link", {name: "Payments", exact: true}).click(); await page.getByLabel("Payment filter", {exact: true}).selectOption("successful");
  await page.locator(`a[href="/admin/payments/${payer.reference}"]`).click(); await expect(page.getByRole("heading", {name: "Test payment receipt", exact: true})).toBeVisible();
  await page.getByRole("button", {name: "Request provider reconciliation", exact: true}).click(); await expect(page.getByText("Provider verification is not configured", {exact: true})).toBeVisible();
  const ownerContext = await browser.newContext();
  try {
    const owner = await ownerContext.newPage(); await owner.goto("http://127.0.0.1:3101/applicant/login"); await owner.getByLabel("Email or username").fill(payer.email); await owner.getByLabel("Password", {exact: true}).fill(payer.password); await owner.getByRole("button", {name: "Sign in", exact: true}).click(); await expect(owner).toHaveURL(/\/applicant\/dashboard$/);
    await owner.getByRole("link", {name: "View payment record", exact: true}).click(); await expect(owner.getByRole("heading", {name: "Test payment receipt", exact: true})).toBeVisible(); await expect(owner.getByText("No live money was collected in this test transaction.", {exact: true})).toBeVisible();
    await expect(owner.getByRole("button", {name: "Request provider reconciliation", exact: true})).toHaveCount(0);
    await mailLink(payer.email, "receipt");
  } finally {await ownerContext.close();}
});
