import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// Runs against the deployed test site and its hosted database (sample "Malhotra family" plus
// test phone numbers). Each run creates a fresh family for the new-user flow.

const stamp = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, "");
const panel = (page: Page) => page.getByRole("complementary").last();

test.describe.configure({ mode: "serial" });

test("viewer sees the family but cannot change it", async ({ page }) => {
  await signIn(page, "98765 00004"); // Rahul, viewer in the sample family
  await expect(page).toHaveURL(/\/s\//);
  const details = panel(page);
  await expect(details.getByRole("heading", { name: "Rahul Malhotra" })).toBeVisible();
  await expect(details.getByText("You", { exact: true })).toBeVisible();
  await expect(details.getByText("Add a relative")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add family" })).toHaveCount(0);
  // The tree is drawn with the people around him.
  await expect(page.locator(".react-flow__node-person").first()).toBeVisible();
});

test("derived siblings: half and step", async ({ page }) => {
  await signIn(page, "98765 00001"); // Arjun, owner
  await page.getByPlaceholder("Find anyone in the family").fill("Kunal");
  await page.getByRole("button", { name: /Kunal Malhotra/ }).click();
  const details = panel(page);
  await expect(details.getByRole("heading", { name: "Kunal Malhotra" })).toBeVisible();
  await expect(details.getByText(/Aisha Malhotra/)).toBeVisible();
  await expect(details.getByText(/Half-sister/)).toBeVisible();
  await expect(details.getByText(/Step-brother/)).toBeVisible();
  await expect(details.getByText(/Wife/)).toBeVisible();
});

test("new user: start a family, run the wizard, add a half sibling, invite someone", async ({ page, browser }) => {
  await signIn(page, "99999 00005");
  await page.goto("/start");
  await page.getByLabel("What should we call this family?").fill(`Test family ${stamp}`);
  await page.getByLabel("First name").fill("Asha");
  await page.getByLabel("Family name").fill("Rao");
  await page.getByLabel("Lives in").fill("Pune");
  await expect(page.getByLabel("Phone")).toHaveValue(/^\+91999990000\d$/);
  await page.getByRole("button", { name: "Next: your family" }).click();

  // Parents
  await expect(page.getByRole("heading", { name: "Your parents" })).toBeVisible();
  const mother = page.locator("section", { has: page.getByRole("heading", { name: "Mother" }) });
  await mother.getByLabel("First name").fill("Lata");
  await mother.getByLabel("Lives in").fill("Pune");
  await mother.getByRole("button", { name: "Ask later" }).click();
  const father = page.locator("section", { has: page.getByRole("heading", { name: "Father" }) });
  await father.getByRole("button", { name: "Passed away" }).click();
  await father.getByLabel("First name").fill("Ravi");
  await father.getByLabel("Last lived in").fill("Nagpur");
  await father.getByLabel("Born").fill("about 1950");
  await page.getByRole("button", { name: "Next" }).click();

  // Partner
  await page.getByRole("button", { name: "Add a partner" }).click();
  await page.getByLabel("First name").fill("Dev");
  await page.getByLabel("Family name").fill("Kumar");
  await page.getByLabel("Lives in").fill("Pune");
  await page.getByLabel("Phone").fill("98000 11111");
  await page.getByRole("button", { name: "Next" }).click();

  // Child with the partner (preselected as the only partner); born 2018, so no phone needed
  await page.getByRole("button", { name: "Add a child" }).click();
  await page.getByLabel("First name").fill("Tara");
  await page.getByLabel("Lives in").fill("Pune");
  await page.getByLabel("Born").fill("2018");
  await expect(page.getByLabel("Phone")).toHaveCount(0);
  await page.getByRole("button", { name: "Next" }).click();

  // Full sibling
  await page.getByRole("button", { name: "Add a sibling" }).click();
  await page.getByLabel("First name").fill("Kiran");
  await page.getByLabel("Lives in").fill("Mumbai");
  await page.getByRole("button", { name: "Ask later" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Check and save" })).toBeVisible();
  await page.getByRole("button", { name: "Save 5 people" }).click();

  // Tree with Asha's relatives, siblings derived from shared parents
  await expect(page).toHaveURL(/focus=/);
  const details = panel(page);
  await expect(details.getByRole("heading", { name: "Asha Rao" })).toBeVisible();
  await expect(details.getByText(/Mother/)).toBeVisible();
  await expect(details.getByText(/Father/)).toBeVisible();
  await expect(details.getByRole("button", { name: /Dev Kumar/ })).toBeVisible();
  await expect(details.getByRole("button", { name: /Tara/ })).toBeVisible();
  await expect(details.getByRole("button", { name: /Kiran/ })).toBeVisible();

  // Add a half sibling (shares only the father) from the panel
  await details.getByRole("button", { name: "Sibling", exact: true }).click();
  const sheet = page.getByRole("complementary", { name: /Add Asha's sibling/ });
  await sheet.getByLabel("Name").fill("Meena Rao");
  await sheet.getByRole("option", { name: /Add “Meena Rao” as someone new/ }).click();
  await sheet.getByLabel("Lives in").fill("Pune");
  await sheet.getByRole("button", { name: "Ask later" }).click();
  await sheet.getByRole("radio", { name: "Only Ravi" }).click();
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added Meena" })).toBeVisible();
  await expect(details.getByText(/Half-sibling/)).toBeVisible();

  // Invite link: a second person joins as an editor
  await page.getByRole("link", { name: "Members" }).click();
  await page.getByRole("radio", { name: "Editor" }).click();
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = (await page.locator("li span.font-mono").first().textContent())!.trim();
  expect(link).toContain("/join/");

  const other = await browser.newContext();
  const page2 = await other.newPage();
  await signIn(page2, "99999 00006");
  await page2.goto(new URL(link).pathname);
  await page2.getByRole("button", { name: "Join the family" }).click();
  await expect(page2).toHaveURL(/\/s\//);
  await page2.getByPlaceholder("Find anyone in the family").fill("Asha");
  await expect(page2.getByRole("button", { name: /Asha Rao/ })).toBeVisible();
  await other.close();
});

test("phone layout starts on the person view @mobile", async ({ page }) => {
  await signIn(page, "98765 00003"); // Tanvi, editor
  await expect(page.getByRole("heading", { name: "Tanvi Malhotra" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rohan Mehra/ })).toBeVisible();
  await page.getByRole("radio", { name: "Tree" }).click();
  await expect(page.locator(".react-flow__node-person").first()).toBeVisible();
});
