import { expect, test } from "@playwright/test";
import { adult, fresh, newFamily, panel, rpc, signIn } from "./support";

// A brand-new person: sign in, start a family, then the guided "Add family" wizard.

test("new user: start a family, then add parents, partner, child and siblings in the wizard", async ({ page }) => {
  await signIn(page, fresh(1));
  await expect(page).toHaveURL(/\/start/);

  // Required fields are checked before anything is saved.
  await page.getByRole("button", { name: "Next: your family" }).click();
  await expect(page.getByText("Add a first name.")).toBeVisible();
  await expect(page.getByText("Add where they live (or lived).")).toBeVisible();
  // Your own phone is prefilled from sign-in and cannot be skipped.
  await expect(page.getByLabel("Phone")).toHaveValue("+919999900001");
  await expect(page.getByRole("button", { name: "Ask later" })).toHaveCount(0);

  await page.getByLabel("What should we call this family?").fill("Rao family");
  await page.getByLabel("First name").fill("Asha");
  await page.getByLabel("Family name").fill("Rao");
  await page.getByLabel("Lives in").fill("Pune");
  await page.getByRole("button", { name: "Next: your family" }).click();

  // Step 1: parents. A living adult needs a phone or "Ask later".
  await expect(page.getByRole("heading", { name: "Your parents" })).toBeVisible();
  const mother = page.locator("section", { has: page.getByRole("heading", { name: "Mother" }) });
  await mother.getByLabel("First name").fill("Lata");
  await mother.getByLabel("Lives in").fill("Pune");
  const father = page.locator("section", { has: page.getByRole("heading", { name: "Father" }) });
  await father.getByRole("button", { name: "Passed away" }).click();
  await expect(father.getByLabel("Phone")).toHaveCount(0); // never asked for someone who has died
  await father.getByLabel("First name").fill("Ravi");
  await father.getByLabel("Last lived in").fill("Nagpur");
  await father.getByLabel("Born").fill("about 1950");
  await father.getByLabel("Died").fill("2015");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(mother.getByText("Add a phone number, or tap “Ask later”.")).toBeVisible();
  await mother.getByRole("button", { name: "Ask later" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Step 2: partner
  await page.getByRole("button", { name: "Add a partner" }).click();
  await page.getByLabel("First name").fill("Dev");
  await page.getByLabel("Family name").fill("Kumar");
  await page.getByLabel("Lives in").fill("Pune");
  await page.getByLabel("Phone").fill("98000 11111");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Step 3: a child born 2018 is a minor: no phone asked.
  await page.getByRole("button", { name: "Add a child" }).click();
  await expect(page.getByRole("radio", { name: "Dev" })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("First name").fill("Tara");
  await page.getByLabel("Lives in").fill("Pune");
  await page.getByLabel("Born").fill("2018");
  await expect(page.getByLabel("Phone")).toHaveCount(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Step 4: a full sibling and a half sibling (same father only)
  await page.getByRole("button", { name: "Add a sibling" }).click();
  await page.getByLabel("First name").fill("Kiran");
  await page.getByLabel("Lives in").fill("Mumbai");
  await page.getByRole("button", { name: "Ask later" }).click();
  await page.getByRole("button", { name: "Add a sibling" }).click();
  const second = page.locator("section", { has: page.getByRole("heading", { name: "Sibling" }) }).nth(1);
  await second.getByRole("radio", { name: "Only Ravi" }).click();
  await second.getByLabel("First name").fill("Meena");
  await second.getByLabel("Lives in").fill("Delhi");
  await second.getByRole("button", { name: "Ask later" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Check and save" })).toBeVisible();
  await page.getByRole("button", { name: "Save 6 people" }).click();

  // The tree opens on Asha with everyone attached and siblings derived.
  await expect(page).toHaveURL(/focus=/);
  const me = panel(page);
  await expect(me.getByRole("heading", { name: "Asha Rao" })).toBeVisible();
  await expect(me.getByRole("button", { name: /Lata.*Mother/ })).toBeVisible(); // mothers keep their own family name, so none is assumed
  await expect(me.getByRole("button", { name: /Ravi Rao.*Father/ })).toBeVisible();
  await expect(me.getByRole("button", { name: /Dev Kumar.*Spouse/ })).toBeVisible();
  await expect(me.getByRole("button", { name: /Tara Rao.*Child/ })).toBeVisible();
  await expect(me.getByRole("button", { name: /Kiran Rao.*Sibling/ })).toBeVisible();
  await expect(me.getByRole("button", { name: /Meena Rao.*Half-sibling/ })).toBeVisible();
  await expect(page.locator(".react-flow__node-person")).toHaveCount(7);

  // A second wizard run knows who is already there.
  await page.getByRole("link", { name: "Add family" }).click();
  await expect(page.getByText(/Already in the tree: (Lata and Ravi Rao|Ravi Rao and Lata)\./)).toBeVisible();
});

test("wizard: unknown parents plus a sibling creates “Unknown mother/father” to link them", async ({ page }) => {
  const { spaceId, meId } = await newFamily(fresh(2), "Placeholder family", { given_name: "Ira" });
  await signIn(page, fresh(2));
  await page.goto(`/s/${spaceId}/wizard`);
  for (const role of ["Mother", "Father"]) {
    await page.locator("section", { has: page.getByRole("heading", { name: role }) }).getByRole("button", { name: "Don't know" }).click();
  }
  await page.getByRole("button", { name: "Next", exact: true }).click(); // parents
  await page.getByRole("button", { name: "Next", exact: true }).click(); // partners
  await page.getByRole("button", { name: "Next", exact: true }).click(); // children
  await page.getByRole("button", { name: "Add a sibling" }).click();
  await page.getByLabel("First name").fill("Om");
  await page.getByLabel("Lives in").fill("Pune");
  await page.getByRole("button", { name: "Ask later" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Save 1 person" }).click();

  await expect(page).toHaveURL(new RegExp(`focus=${meId}`));
  const me = panel(page);
  await expect(me.getByRole("button", { name: /Om Shah.*Brother|Om Shah.*Sibling/ })).toBeVisible();
  await expect(me.getByRole("button", { name: /Unknown father/ })).toBeVisible();
  await expect(me.getByRole("button", { name: /Unknown mother/ })).toBeVisible();
});

test("wizard: filling in a parent replaces “Unknown mother”, and earlier siblings get her too", async ({ page }) => {
  const { spaceId, meId, db } = await newFamily(fresh(3), "Fill-in family", { given_name: "Nila" });
  const sib = await rpc(db, "add_sibling", { p_person_id: meId, p_new: adult("Veer", { gender: "male" }) });

  await signIn(page, fresh(3));
  await page.goto(`/s/${spaceId}/wizard`);
  // Placeholders are offered as cards to fill, not shown as known parents.
  await expect(page.getByText(/Already in the tree/)).toHaveCount(0);
  const mother = page.locator("section", { has: page.getByRole("heading", { name: "Mother" }) });
  await mother.getByLabel("First name").fill("Gita");
  await mother.getByLabel("Lives in").fill("Pune");
  await mother.getByRole("button", { name: "Ask later" }).click();
  await page.locator("section", { has: page.getByRole("heading", { name: "Father" }) }).getByRole("button", { name: "Don't know" }).click();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Save 1 person" }).click();
  await expect(page).toHaveURL(/focus=/);

  await page.goto(`/s/${spaceId}?focus=${sib}`);
  const veer = panel(page);
  await expect(veer.getByRole("heading", { name: "Veer Shah" })).toBeVisible();
  await expect(veer.getByRole("button", { name: /Gita.*Mother/ })).toBeVisible();
  await expect(veer.getByRole("button", { name: /Unknown mother/ })).toHaveCount(0);
  await expect(veer.getByRole("button", { name: /Nila Shah.*Sister|Nila Shah.*Sibling/ })).toBeVisible();
});

test("wizard is closed to viewers, with an explanation", async ({ page }) => {
  await signIn(page, "98765 00004"); // Rahul, viewer in the sample family
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]+/);
  await expect(page.getByRole("link", { name: "Add family" })).toHaveCount(0);
  const spaceId = page.url().match(/\/s\/([^/?]+)/)![1];
  await page.goto(`/s/${spaceId}/wizard`);
  await expect(page.getByText(/Viewers can look at the tree but can't add people/)).toBeVisible();
});
