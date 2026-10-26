import { expect, test } from "@playwright/test";

test("explains eligibility, prices and post-acceptance payment", async ({ page }) => {
  await page.goto("/join");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your presence.");
  await expect(page.getByText("₦50,000", { exact: false })).toBeVisible();
  await expect(page.getByText("₦30,000", { exact: false })).toBeVisible();
  await expect(page.getByText("Submission is free.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Choose academy" }).click();
  await expect(page).toHaveURL(/\/applicant\/register\?track=academy/);
  await expect(page.getByRole("main")).toContainText("Create your applicant account");
});

test("offers keyboard skip navigation and no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("discloses policy status and keeps member registration invitation-only", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("main")).toContainText("not yet published or approved");
  await page.getByRole("link", { name: "Member portal" }).click();
  await expect(page.getByRole("main")).toContainText("invitation");
});
