import { expect, test } from "@playwright/test";

test("cookie choices are saved and can be reopened from the footer", async ({ page, isMobile }) => {
  await page.goto("/");

  const preferences = page.getByRole("region", { name: "Cookie preferences" });
  await expect(preferences).toBeVisible();
  if (isMobile) {
    const box = await preferences.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height / page.viewportSize()!.height).toBeLessThan(0.34);
  }
  await page.getByRole("button", { name: "Manage choices" }).click();

  await expect(page.getByLabel("Necessary", { exact: false })).toBeChecked();
  await expect(page.getByLabel("Necessary", { exact: false })).toBeDisabled();
  await page.getByLabel("Analytics", { exact: false }).check();
  await page.getByRole("button", { name: "Save choices" }).click();
  await expect(preferences).toBeHidden();

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(preferences).toBeHidden();
  await page.getByRole("button", { name: "Cookie settings" }).click();
  await expect(preferences).toBeVisible();
  await expect(page.getByLabel("Analytics", { exact: false })).toBeChecked();
});
