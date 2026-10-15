import { expect, test, type Page } from "@playwright/test";
import { adult, fresh, newFamily, openPerson, panel, rpc, signIn } from "./support";

// Adding, linking, editing and removing relatives from the person panel.

async function startAdding(page: Page, kind: "Parent" | "Partner" | "Child" | "Sibling", name: string) {
  await panel(page).getByRole("button", { name: kind, exact: true }).click();
  const sheet = page.getByRole("complementary", { name: new RegExp(`^Add ${name}'s`) });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function fillNew(sheet: ReturnType<Page["getByRole"]>, name: string, place = "Pune") {
  await sheet.getByLabel("Name").fill(name);
  await sheet.getByRole("option", { name: new RegExp(`Add “${name}” as someone new`) }).click();
  await sheet.getByLabel(/Lives in|Last lived in/).fill(place);
  if (await sheet.getByRole("button", { name: "Ask later" }).count()) await sheet.getByRole("button", { name: "Ask later" }).click();
}

async function save(page: Page, sheet: ReturnType<Page["getByRole"]>, toast: RegExp) {
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: toast })).toBeVisible();
}

test("parents: the second parent is linked as a couple, and a third birth parent is refused", async ({ page }) => {
  const { spaceId, meId } = await newFamily(fresh(4), "Parents family", { given_name: "Zoya" });
  await signIn(page, fresh(4));
  await openPerson(page, spaceId, meId);

  let sheet = await startAdding(page, "Parent", "Zoya");
  await sheet.getByRole("radio", { name: "Mother" }).click();
  await fillNew(sheet, "Rukmini Shah");
  await save(page, sheet, /Added Rukmini/);

  sheet = await startAdding(page, "Parent", "Zoya");
  await sheet.getByRole("radio", { name: "Father" }).click();
  await fillNew(sheet, "Harish Shah");
  await expect(sheet.getByText("Were they a couple with Rukmini?")).toBeVisible();
  await sheet.getByRole("radio", { name: "Married" }).click();
  await save(page, sheet, /Added Harish/);

  // Rukmini now shows Harish as her husband.
  await panel(page).getByRole("button", { name: /Rukmini Shah/ }).click();
  await expect(panel(page).getByRole("heading", { name: "Rukmini Shah" })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: /Harish Shah.*Husband|Harish Shah.*Spouse/ })).toBeVisible();

  // Back on Zoya, a third birth parent is refused with an explanation.
  await openPerson(page, spaceId, meId);
  sheet = await startAdding(page, "Parent", "Zoya");
  await sheet.getByRole("radio", { name: "Mother" }).click();
  await fillNew(sheet, "Someone Else");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet.getByRole("alert")).toContainText("already has two parents");
});

test("adding someone already in the family links them instead of making a duplicate", async ({ page }) => {
  const { spaceId, meId, db } = await newFamily(fresh(5), "Linking family", { given_name: "Kabir" });
  // Kabir's cousin's wife Priya is in the tree but not linked to Kabir.
  const cousin = await rpc(db, "add_sibling", { p_person_id: meId, p_new: adult("Cousin") });
  await rpc(db, "add_partner", { p_person_id: cousin, p_new: adult("Priya", { family_name: "Iyer", gender: "female" }) });

  await signIn(page, fresh(5));
  await openPerson(page, spaceId, meId);
  const sheet = await startAdding(page, "Partner", "Kabir");
  await sheet.getByLabel("Name").fill("Priya Iyer");
  const match = sheet.getByRole("option", { name: /Priya Iyer/ }).first();
  await expect(sheet.getByText("Already in the family")).toBeVisible();
  await expect(match).toContainText("Similar name");
  await match.click();
  await expect(sheet.getByText("Priya Iyer")).toBeVisible();
  await save(page, sheet, /Added Priya Iyer/);

  const { count } = await db.from("persons").select("id", { count: "exact", head: true }).eq("space_id", spaceId).eq("given_name", "Priya").is("deleted_at", null);
  expect(count).toBe(1);
  await expect(panel(page).getByRole("button", { name: /Priya Iyer.*Wife|Priya Iyer.*Spouse/ })).toBeVisible();
});

test("partners and children: statuses show, duplicates and impossible links are refused", async ({ page }) => {
  const { spaceId, meId, db } = await newFamily(fresh(6), "Partners family", { given_name: "Vikram", gender: "male" });
  await rpc(db, "add_partner", { p_person_id: meId, p_new: adult("Anu", { gender: "female" }), p_end_reason: "divorce" });
  await signIn(page, fresh(6));
  await openPerson(page, spaceId, meId);
  const me = panel(page);
  await expect(me.getByRole("button", { name: /Anu Shah.*Wife.*divorced/ })).toBeVisible();

  // A second marriage.
  let sheet = await startAdding(page, "Partner", "Vikram");
  await fillNew(sheet, "Bela Shah");
  await sheet.getByLabel(/Married in/).fill("2012");
  await save(page, sheet, /Added Bela/);
  await expect(me.getByRole("button", { name: /Bela Shah.*married 2012/ })).toBeVisible();
  await expect(me.getByText("Partners", { exact: true })).toBeVisible();

  // With two partners, the other parent of a new child must be chosen.
  sheet = await startAdding(page, "Child", "Vikram");
  await fillNew(sheet, "Chirag Shah");
  await sheet.getByLabel("Born").fill("2015");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet.getByRole("alert")).toContainText("Choose who the other parent is");
  await sheet.getByRole("radio", { name: "Bela Shah" }).click();
  await save(page, sheet, /Added Chirag/);

  // Adding Bela as a partner again is refused.
  sheet = await startAdding(page, "Partner", "Vikram");
  await sheet.getByLabel("Name").fill("Bela Shah");
  await expect(sheet.getByRole("option", { name: /Bela Shah/ })).toHaveCount(1); // only "add as new": Bela is excluded
  await sheet.getByRole("button", { name: "Close" }).click();

  // No loops: Vikram's grandchild cannot also become his father.
  const chirag = (await db.from("persons").select("id").eq("space_id", spaceId).eq("given_name", "Chirag").single()).data!.id;
  await rpc(db, "add_child", { p_parent_id: chirag, p_new: adult("Gopal") });
  sheet = await startAdding(page, "Parent", "Vikram");
  await sheet.getByRole("radio", { name: "Father" }).click();
  await sheet.getByLabel("Name").fill("Gopal Shah");
  await sheet.getByRole("option", { name: /Gopal Shah/ }).first().click();
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet.getByRole("alert")).toContainText("own ancestor");
});

test("siblings: with no parents known, “Unknown father/mother” link them; adding the real mother later replaces the placeholder", async ({ page }) => {
  const { spaceId, meId } = await newFamily(fresh(7), "Sibling family", { given_name: "Rhea", gender: "female" });
  await signIn(page, fresh(7));
  await openPerson(page, spaceId, meId);

  let sheet = await startAdding(page, "Sibling", "Rhea");
  await fillNew(sheet, "Sam Shah");
  await expect(sheet.getByText(/we'll add them as “Unknown father” and “Unknown mother”/)).toBeVisible();
  await save(page, sheet, /Added Sam/);
  const me = panel(page);
  await expect(me.getByRole("button", { name: /Sam Shah.*Sibling/ })).toBeVisible();
  await expect(me.getByRole("button", { name: /Unknown mother.*Not known yet/ })).toBeVisible();

  sheet = await startAdding(page, "Parent", "Rhea");
  await sheet.getByRole("radio", { name: "Mother" }).click();
  await expect(sheet.getByText(/They'll replace “Unknown mother”/)).toBeVisible();
  await fillNew(sheet, "Maya Shah");
  await save(page, sheet, /Added Maya/);
  await expect(me.getByRole("button", { name: /Maya Shah.*Mother/ })).toBeVisible();
  await expect(me.getByRole("button", { name: /Unknown mother/ })).toHaveCount(0);

  await me.getByRole("button", { name: /Sam Shah/ }).click();
  await expect(me.getByRole("heading", { name: "Sam Shah" })).toBeVisible();
  await expect(me.getByRole("button", { name: /Maya Shah.*Mother/ })).toBeVisible();
  await expect(me.getByRole("button", { name: /Rhea Shah.*Sister/ })).toBeVisible();

  // Filling in the unknown father turns him into a real person.
  await me.getByRole("button", { name: /Unknown father/ }).click();
  await expect(me.getByRole("heading", { name: "Unknown father" })).toBeVisible();
  await me.getByRole("button", { name: "Fill in" }).click();
  const fill = page.getByRole("complementary", { name: "Unknown father" });
  await expect(fill.getByRole("button", { name: "Passed away" })).toHaveAttribute("aria-pressed", "false");
  await fill.getByLabel("First name").fill("Mohan");
  await fill.getByLabel("Lives in").fill("Pune");
  await fill.getByRole("button", { name: "Ask later" }).click();
  await fill.getByRole("button", { name: "Save" }).click();
  await expect(me.getByRole("heading", { name: "Mohan Shah" })).toBeVisible();
});

test("form rules: dates are understood, mistakes are explained, minors need no phone", async ({ page }) => {
  const { spaceId, meId } = await newFamily(fresh(8), "Rules family", { given_name: "Dia" });
  await signIn(page, fresh(8));
  await openPerson(page, spaceId, meId);

  const sheet = await startAdding(page, "Child", "Dia");
  await sheet.getByLabel("Name").fill("Kiaan Shah");
  await sheet.getByRole("option", { name: /as someone new/ }).click();
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet.getByText("Add where they live (or lived).")).toBeVisible();
  await expect(sheet.getByText("Add a phone number, or tap “Ask later”.")).toBeVisible();

  await sheet.getByLabel("Lives in").fill("Pune");
  await sheet.getByLabel("Born").fill("sometime");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet.getByText(/Try “1952”, “about 1950”/)).toBeVisible();

  // "Under 18" removes the phone requirement; it is kept when editing later.
  await sheet.getByLabel("Born").fill("");
  await sheet.getByLabel("Under 18").check();
  await expect(sheet.getByLabel("Phone")).toHaveCount(0);
  await save(page, sheet, /Added Kiaan/);

  const me = panel(page);
  await me.getByRole("button", { name: /Kiaan Shah/ }).click();
  await expect(me.getByText("Under 18")).toBeVisible();
  await me.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("complementary", { name: "Kiaan Shah" });
  await expect(edit.getByLabel("Under 18")).toBeChecked();
  await expect(edit.getByLabel("Phone")).toHaveCount(0);

  // Death before birth is caught.
  await edit.getByRole("button", { name: "Passed away" }).click();
  await edit.getByLabel("Born").fill("2001");
  await edit.getByLabel("Died").fill("1999");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit.getByText("The death date is before the birth date.")).toBeVisible();
  await edit.getByRole("button", { name: "Cancel" }).click();
});

test("editing: name, place and dates change everywhere, and a family name can be cleared", async ({ page }) => {
  const { spaceId, meId, db } = await newFamily(fresh(9), "Editing family", { given_name: "Tanu" });
  const dad = await rpc(db, "add_parent", { p_child_id: meId, p_new: adult("Ramesh", { gender: "male" }) });
  await signIn(page, fresh(9));
  await openPerson(page, spaceId, dad);

  const me = panel(page);
  await me.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("complementary", { name: "Ramesh Shah" });
  await edit.getByLabel("First name").fill("Rameshwar");
  await edit.getByLabel("Family name").fill("");
  await edit.getByLabel("Lives in").fill("Jaipur");
  await edit.getByLabel("Born").fill("about 1948");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(me.getByRole("heading", { name: "Rameshwar", exact: true })).toBeVisible();
  await expect(me.getByText(/~1948.*Jaipur|b\. ~1948.*Jaipur/)).toBeVisible();

  await page.reload();
  await expect(panel(page).getByRole("heading", { name: "Rameshwar", exact: true })).toBeVisible();
  await expect(page.locator(".react-flow__node-person", { hasText: "Rameshwar" })).toContainText("Jaipur");
});

test("removing: a wrongly added parent can be removed and the right one added; your own profile can't be removed", async ({ page }) => {
  const { spaceId, meId, db } = await newFamily(fresh(10), "Removal family", { given_name: "Ana" });
  await rpc(db, "add_parent", { p_child_id: meId, p_new: adult("Mother", { gender: "female" }) });
  const wrong = await rpc(db, "add_parent", { p_child_id: meId, p_new: adult("Wrongdad", { gender: "male" }) });
  await signIn(page, fresh(10));

  await openPerson(page, spaceId, meId);
  await expect(panel(page).getByRole("button", { name: /Remove from the tree/ })).toHaveCount(0);

  await openPerson(page, spaceId, wrong);
  page.once("dialog", (d) => d.accept());
  await panel(page).getByRole("button", { name: /Remove from the tree/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Removed Wrongdad" })).toBeVisible();

  await openPerson(page, spaceId, meId);
  const sheet = await startAdding(page, "Parent", "Ana");
  await sheet.getByRole("radio", { name: "Father" }).click();
  await fillNew(sheet, "Rightdad Shah");
  await save(page, sheet, /Added Rightdad/);
  await expect(panel(page).getByRole("button", { name: /Rightdad Shah.*Father/ })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: /Wrongdad/ })).toHaveCount(0);

  // Search no longer finds the removed person.
  await page.getByPlaceholder("Find anyone in the family").fill("Wrongdad");
  await expect(page.getByRole("banner").getByRole("button", { name: /Wrongdad/ })).toHaveCount(0);
});
