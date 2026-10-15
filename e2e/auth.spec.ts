import { expect, test } from "@playwright/test";
import { SEED, completeLogin, signIn } from "./support";

// Sign-in, sign-out and who can reach which page.

test("signs in with a phone number and code, and lands on their family", async ({ page }) => {
  await signIn(page, SEED.viewer);
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: "Rahul Malhotra" }).first()).toBeVisible();
});

test("rejects a malformed number and a wrong code", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Phone number").fill("12345");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("valid phone number");

  await page.getByLabel("Phone number").fill(SEED.viewer);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("code didn't work");
  await expect(page).toHaveURL(/\/login/);

  // Correcting the code works without starting over.
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
});

test("signed-out visitors are sent to sign in, then back to the page they wanted", async ({ page }) => {
  await page.goto("/join/not-a-real-token");
  await expect(page).toHaveURL(/\/login\?next=%2Fjoin%2Fnot-a-real-token/);
  await completeLogin(page, SEED.viewer);
  await expect(page).toHaveURL(/\/join\/not-a-real-token/);
  await expect(page.getByRole("heading", { name: /no longer works/ })).toBeVisible();

  // Already signed in: the login page passes straight through.
  await page.goto("/login?next=%2F");
  await expect(page).not.toHaveURL(/\/login/);
});

test("the return address after sign-in cannot point to another site", async ({ page }) => {
  await page.goto("/login?next=//example.com");
  await completeLogin(page, SEED.viewer);
  await expect(page).toHaveURL(/127\.0\.0\.1|localhost/);
  await expect(page).toHaveURL(/\/s\//);
});

test("signing out ends the session", async ({ page }) => {
  await signIn(page, SEED.viewer);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("unknown pages show a friendly not-found screen", async ({ page }) => {
  await signIn(page, SEED.viewer);
  await page.goto("/this-does-not-exist");
  await expect(page.getByRole("heading", { name: "There's nothing here" })).toBeVisible();
});
