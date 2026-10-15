import { expect, test } from "@playwright/test";
import { SEED, panel, signIn } from "./support";

// The visual tree and person panel, on the sample "Malhotra family" (read-only checks).

test("opens on you, marked YOU, with relatives drawn around you", async ({ page }) => {
  await signIn(page, SEED.owner);
  await expect(panel(page).getByRole("heading", { name: "Arjun Malhotra" })).toBeVisible();
  await expect(panel(page).getByText("You", { exact: true })).toBeVisible();
  const me = page.locator(".react-flow__node-person", { hasText: "Arjun Malhotra" });
  await expect(me).toContainText("YOU");
  expect(await page.locator(".react-flow__node-person").count()).toBeGreaterThan(10);
});

test("click selects, double-click re-centres, and the link keeps the person on reload", async ({ page }) => {
  await signIn(page, SEED.owner);
  const node = page.locator(".react-flow__node-person", { hasText: "Meera Iyer" });
  await node.click();
  await expect(panel(page).getByRole("heading", { name: "Meera Iyer" })).toBeVisible();
  await expect(page).not.toHaveURL(/focus=/); // a click only selects

  await node.dblclick();
  await expect(page).toHaveURL(/focus=/);
  await page.reload();
  await expect(panel(page).getByRole("heading", { name: "Meera Iyer" })).toBeVisible();
});

test("derived siblings: half and step, plus partner labels", async ({ page }) => {
  await signIn(page, SEED.owner);
  await page.getByPlaceholder("Find anyone in the family").fill("Kunal");
  await page.getByRole("banner").getByRole("button", { name: /Kunal Malhotra/ }).click();
  const kunal = panel(page);
  await expect(kunal.getByRole("heading", { name: "Kunal Malhotra" })).toBeVisible();
  await expect(kunal.getByText(/Half-sister/)).toBeVisible();
  await expect(kunal.getByText(/Step-brother/)).toBeVisible();
  await expect(kunal.getByText(/Wife/)).toBeVisible();
});

test("generations up and down change how much of the tree is drawn", async ({ page }) => {
  await signIn(page, SEED.owner);
  const nodes = page.locator(".react-flow__node-person");
  await expect(nodes.first()).toBeVisible();
  const before = await nodes.count();
  await page.getByLabel("Up").selectOption("1");
  await page.getByLabel("Down").selectOption("1");
  await expect.poll(() => nodes.count()).toBeLessThan(before);
});

test("a link to someone outside this family falls back to you", async ({ page }) => {
  await signIn(page, SEED.owner);
  const url = new URL(page.url());
  await page.goto(`${url.pathname}?focus=00000000-0000-0000-0000-000000000000`);
  await expect(panel(page).getByRole("heading", { name: "Arjun Malhotra" })).toBeVisible();
});

test("phones: person view first, tree one tap away, header does not overlap @mobile", async ({ page }) => {
  await signIn(page, SEED.editor);
  await expect(page.getByRole("heading", { name: "Tanvi Malhotra" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rohan Mehra/ })).toBeVisible();

  const search = await page.getByPlaceholder("Find anyone in the family").boundingBox();
  const nav = await page.getByRole("navigation", { name: "Main" }).boundingBox();
  expect(search && nav && (search.y >= nav.y + nav.height || search.y + search.height <= nav.y)).toBeTruthy();

  await page.getByRole("radio", { name: "Tree" }).click();
  await expect(page.locator(".react-flow__node-person").first()).toBeVisible();
  // Tapping someone on the tree goes back to their details.
  await page.locator(".react-flow__node-person", { hasText: "Rohan Mehra" }).click();
  await expect(page.getByRole("heading", { name: "Rohan Mehra" })).toBeVisible();
});
