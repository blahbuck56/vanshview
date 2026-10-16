import { expect, test, type Page } from "@playwright/test";
import { SEED, adult, fresh, newFamily, openPerson, panel, rpc, signIn } from "./support";

// Security headers, the uptime check, and names from every family.

function watchForBlockedContent(page: Page) {
  const blocked: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (load|execute|connect|frame|apply)/i.test(m.text())) blocked.push(m.text());
  });
  return blocked;
}

test("every page is sent with security headers", async ({ request }) => {
  for (const path of ["/login", "/", "/join/anything"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"], path).toContain("default-src 'self'");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["strict-transport-security"], path).toContain("max-age=");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], path).toContain("camera=()");
    expect(h["x-powered-by"], path).toBeUndefined();
  }
});

test("the security policy blocks nothing the app needs: sign in, tree, search, edit", async ({ page }) => {
  const blocked = watchForBlockedContent(page);
  await signIn(page, SEED.owner);
  await expect(page.locator(".react-flow__node-person").first()).toBeVisible();
  await page.getByPlaceholder("Find anyone in the family").fill("Meera");
  await page.getByRole("banner").getByRole("button", { name: /Meera Iyer/ }).click();
  await expect(panel(page).getByRole("heading", { name: "Meera Iyer" })).toBeVisible();
  await page.goto(new URL(page.url()).pathname + "/members");
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  expect(blocked).toEqual([]);
});

test("the uptime check answers without signing in", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(await res.json()).toMatchObject({ ok: true, db: "up" });
});

test("names with apostrophes, Indian scripts and right-to-left letters are saved, shown and found", async ({ page }) => {
  const { spaceId, meId, db } = await newFamily(fresh(25), "D'Souza family", { given_name: "Rose", family_name: "D'Souza" });
  await rpc(db, "add_sibling", { p_person_id: meId, p_new: adult("नीलम", { family_name: "मल्होत्रा" }) });
  await rpc(db, "add_sibling", { p_person_id: meId, p_new: adult("زینب", { family_name: "خان" }) });

  await signIn(page, fresh(25));
  await openPerson(page, spaceId, meId);

  // Typed with an iPhone's curly apostrophe through the real form...
  await panel(page).getByRole("button", { name: "Sibling", exact: true }).click();
  const sheet = page.getByRole("complementary", { name: /^Add Rose's/ });
  await sheet.getByLabel("Name").fill("Mary D’Souza");
  await sheet.getByRole("option", { name: /Add “Mary D’Souza” as someone new/ }).click();
  await sheet.getByLabel(/Lives in/).fill("Goa");
  await sheet.getByRole("button", { name: "Ask later" }).click();
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /Added/ })).toBeVisible();

  // ...and found with a straight one, as an Android keyboard types it.
  const search = page.getByPlaceholder("Find anyone in the family");
  await search.fill("mary d'souza");
  await expect(page.getByRole("banner").getByRole("button", { name: /Mary D’Souza/ })).toBeVisible();

  await search.fill("नीलम");
  await page.getByRole("banner").getByRole("button", { name: /नीलम मल्होत्रा/ }).click();
  await expect(panel(page).getByRole("heading", { name: "नीलम मल्होत्रा" })).toBeVisible();
  await expect(page.locator(".react-flow__node-person", { hasText: "नीलम मल्होत्रा" })).toBeVisible();

  await search.fill("زینب");
  await page.getByRole("banner").getByRole("button", { name: /زینب خان/ }).click();
  await expect(panel(page).getByRole("heading", { name: "زینب خان" })).toBeVisible();
});
