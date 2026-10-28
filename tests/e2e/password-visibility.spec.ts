import { expect, test } from "@playwright/test";

test("reveals and masks account passwords without submitting or changing their values", async ({page}) => {
  for (const [path, label] of [
    ["/applicant/register", "Password"],
    ["/applicant/login", "Password"],
    ["/applicant/reset-password?token=sample", "New password"],
    ["/member/login", "Password"],
    ["/admin/login", "Password"],
    ["/admin/activate?token=sample", "Account password"],
    ["/member/activate?token=sample", "Current account password"],
  ]) {
    await page.goto(path!);
    const field = page.getByLabel(label!, {exact: true});
    await expect(field).toHaveAttribute("type", "password");
    await field.fill("Sample passphrase for visibility");
    const show = page.getByRole("button", {name: `Show ${label!.toLowerCase()}`, exact: true});
    await show.focus();
    await page.keyboard.press("Enter");
    await expect(field).toHaveAttribute("type", "text");
    await expect(field).toHaveValue("Sample passphrase for visibility");
    const hide = page.getByRole("button", {name: `Hide ${label!.toLowerCase()}`, exact: true});
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await hide.click();
    await expect(field).toHaveAttribute("type", "password");
    await expect(field).toHaveValue("Sample passphrase for visibility");
    await expect(page).toHaveURL(new RegExp(path!.split("?")[0]+"(?:\\?|$)"));
  }
  await page.goto("/applicant/register");
  await expect(page.getByLabel("Password", {exact: true})).toHaveValue("");
  await expect(page.getByLabel("Password", {exact: true})).toHaveAttribute("type", "password");
});
