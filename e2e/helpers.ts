import { expect, type Page } from "@playwright/test";

/** Sign in with a Supabase test phone number (fixed code 123456). */
export async function signIn(page: Page, localNumber: string) {
  await page.goto("/login");
  await page.getByLabel("Phone number").fill(localNumber);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
