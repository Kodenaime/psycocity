import { expect, test } from "@playwright/test";

test("hydrates the real homepage and connects to the same-origin API", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/status");
  await expect(page).toHaveTitle("Service status — Psycocity");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connection check");
  await expect(page.getByRole("status")).toHaveText("API connected");
  expect(errors).toEqual([]);
});

test("shows an honest unavailable state after a failed health request", async ({ page }) => {
  await page.route("**/api/v1/health", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Unavailable" }) }));
  await page.goto("/status");
  await expect(page.getByRole("status")).toHaveText("API unavailable. Please try again later.");
});

test("rejects malformed success responses rather than claiming a connection", async ({ page }) => {
  await page.route("**/api/v1/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "unexpected" }) }));
  await page.goto("/status");
  await expect(page.getByRole("status")).toHaveText("API unavailable. Please try again later.");
});

test("renders web 404 and provides working home navigation", async ({ page }) => {
  const response = await page.goto("/unknown-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
  await page.getByRole("link", { name: "home page" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A new stage");
});

test("keeps unknown API routes separate from the HTML document", async ({ request }) => {
  const response = await request.get("/api/unknown");
  expect(response.status()).toBe(404);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "API route not found", requestId: response.headers()["x-request-id"] } });
});
