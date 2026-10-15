import { expect, test } from "@playwright/test";
import { adult, fresh, newFamily, openPerson, panel, rpc, signIn } from "./support";

// Details found by entering a 6-generation family by hand: family name at birth, gender,
// the parents' relationship, the guide's review screen, and the wider tree.

test("family name at birth: shown as née, findable by it, and kept when editing", async ({ page }) => {
  const { spaceId, meId, db } = await newFamily(fresh(21), "Birth names family", { given_name: "Ankit", family_name: "Sharma", gender: "male" });
  const dad = await rpc(db, "add_parent", { p_child_id: meId, p_new: adult("Rajesh", { family_name: "Sharma", gender: "male" }) });
  await signIn(page, fresh(21));
  await openPerson(page, spaceId, dad);

  await panel(page).getByRole("button", { name: "Sibling", exact: true }).click();
  const sheet = page.getByRole("complementary", { name: /^Add Rajesh's/ });
  await sheet.getByLabel("Name").fill("Meena Gupta");
  await sheet.getByRole("option", { name: /as someone new/ }).click();
  await sheet.getByRole("radio", { name: "Female" }).click();
  await sheet.getByRole("button", { name: "+ Different family name at birth?" }).click();
  await sheet.getByLabel("Family name at birth").fill("Sharma");
  await sheet.getByLabel("Lives in").fill("Jaipur");
  await sheet.getByRole("button", { name: "Ask later" }).click();
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added Meena" })).toBeVisible();

  // Gender gives the right word; the birth name shows next to her.
  await expect(panel(page).getByRole("button", { name: /Meena Gupta.*Sister.*née Sharma/ })).toBeVisible();
  await expect(page.locator(".react-flow__node-person", { hasText: "Meena Gupta" })).toContainText("née Sharma");

  // Searching her birth name finds her.
  await page.getByPlaceholder("Find anyone in the family").fill("Meena Sharma");
  await page.getByRole("banner").getByRole("button", { name: /Meena Gupta/ }).click();
  await expect(panel(page).getByRole("heading", { name: "Meena Gupta" })).toBeVisible();

  // Editing shows it, and clearing it removes it.
  await panel(page).getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("complementary", { name: "Meena Gupta" });
  await expect(edit.getByLabel("Family name at birth")).toHaveValue("Sharma");
  await edit.getByLabel("Family name at birth").fill("");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(panel(page).getByText(/née Sharma/)).toHaveCount(0);
});

test("the tree shows aunts, uncles and cousins around you", async ({ page }) => {
  const { spaceId, meId, db } = await newFamily(fresh(22), "Cousins family", { given_name: "Ankit" });
  const dad = await rpc(db, "add_parent", { p_child_id: meId, p_new: adult("Rajesh", { gender: "male" }) });
  const aunt = await rpc(db, "add_sibling", { p_person_id: dad, p_new: adult("Meena", { gender: "female" }) });
  await rpc(db, "add_child", { p_parent_id: aunt, p_new: adult("Kavya", { gender: "female" }) });
  await signIn(page, fresh(22));
  await openPerson(page, spaceId, meId);
  for (const name of ["Ankit", "Rajesh", "Meena", "Kavya"]) {
    await expect(page.locator(".react-flow__node-person", { hasText: name })).toBeVisible();
  }
});

test("guide: parents' relationship, widowed partner, current partner as other parent, real review, safe skip", async ({ page }) => {
  await newFamily(fresh(23), "Guide family", { given_name: "Sunita", gender: "female" });
  await signIn(page, fresh(23));
  await page.getByRole("link", { name: "Add family" }).click();

  // Parents: their relationship is asked, not assumed.
  const mother = page.locator("section", { has: page.getByRole("heading", { name: "Mother" }) });
  const father = page.locator("section", { has: page.getByRole("heading", { name: "Father" }) });
  await expect(mother.getByRole("radiogroup", { name: "Gender" })).toHaveCount(0); // known from the role
  await mother.getByLabel("First name").fill("Kamla");
  await mother.getByLabel("Lives in").fill("Agra");
  await mother.getByRole("button", { name: "Ask later" }).click();
  await father.getByLabel("First name").fill("Mohan");
  await father.getByLabel("Lives in").fill("Agra");
  // A missing phone on the last card is scrolled into view, not left below the fold.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(father.getByText("Add a phone number, or tap “Ask later”.")).toBeInViewport();
  await father.getByRole("button", { name: "Ask later" }).click();
  await page.getByRole("radio", { name: "Divorced or separated" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Partners: a first husband who died, then the current one.
  await page.getByRole("button", { name: "Add a partner" }).click();
  let card = page.locator("section", { has: page.getByRole("heading", { name: "Partner" }) }).nth(0);
  await expect(card.getByRole("radio", { name: "Male", exact: true })).toHaveAttribute("aria-checked", "true"); // opposite of Sunita
  await card.getByRole("radio", { name: "Widowed" }).click();
  await expect(card.getByRole("button", { name: "Passed away" })).toHaveAttribute("aria-pressed", "true");
  await card.getByLabel("First name").fill("Arun");
  await card.getByLabel("Family name").fill("Verma");
  await card.getByLabel("Last lived in").fill("Agra");
  await page.getByRole("button", { name: "Add a partner" }).click();
  card = page.locator("section", { has: page.getByRole("heading", { name: "Partner" }) }).nth(1);
  await card.getByLabel(/Married in/).fill("2012");
  await card.getByLabel("First name").fill("Vivek");
  await card.getByLabel("Family name").fill("Rao");
  await card.getByLabel("Lives in").fill("Pune");
  await card.getByRole("button", { name: "Ask later" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Children: the current husband is the default other parent, and the child takes his name.
  await page.getByRole("button", { name: "Add a child" }).click();
  const child = page.locator("section", { has: page.getByRole("heading", { name: "Child" }) });
  await expect(child.getByRole("radio", { name: "Vivek" })).toHaveAttribute("aria-checked", "true");
  await expect(child.getByLabel("Family name")).toHaveValue("Rao");
  await child.getByRole("radio", { name: "Female" }).click();
  await child.getByLabel("First name").fill("Isha");
  await child.getByLabel("Lives in").fill("Pune");
  await expect(child.getByLabel("Phone (optional)")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Review: each person with their relationship and details, and a way back.
  await expect(page.getByRole("heading", { name: "Check and save" })).toBeVisible();
  const list = page.getByRole("list");
  await expect(list.getByText("Mother", { exact: true })).toBeVisible();
  await expect(list.getByText("Husband · widowed")).toBeVisible();
  await expect(list.getByText("Husband · married 2012")).toBeVisible();
  await expect(list.getByText("Daughter · with Vivek")).toBeVisible();

  // Skipping now warns before throwing the entries away.
  page.once("dialog", (d) => {
    expect(d.message()).toContain("won't be added");
    d.dismiss();
  });
  await page.getByRole("button", { name: "Skip to the tree" }).click();
  await expect(page.getByRole("heading", { name: "Check and save" })).toBeVisible();

  await page.getByRole("button", { name: "Save 5 people" }).click();
  await expect(page).toHaveURL(/focus=/);
  const me = panel(page);
  await expect(me.getByRole("button", { name: /Arun Verma.*Husband.*widowed/ })).toBeVisible();
  await expect(me.getByRole("button", { name: /Vivek Rao.*Husband.*married 2012/ })).toBeVisible();
  await expect(me.getByRole("button", { name: /Isha Rao.*Daughter/ })).toBeVisible();
  await me.getByRole("button", { name: /Mohan/ }).click();
  await expect(me.getByRole("button", { name: /Kamla.*Wife.*divorced/ })).toBeVisible();
});

test("about you: no 'Passed away' or 'Under 18', and a clear message for your own phone", async ({ page }) => {
  await signIn(page, fresh(24));
  await expect(page).toHaveURL(/\/start/);
  await expect(page.getByRole("button", { name: "Passed away" })).toHaveCount(0);
  await expect(page.getByLabel("Under 18")).toHaveCount(0);
  await expect(page.getByLabel("Phone")).toHaveValue("+919999900024"); // prefilled from sign-in
  await page.getByLabel("Phone").fill("");
  await page.getByRole("button", { name: "Next: your family" }).click();
  await expect(page.getByText("Your own phone number is needed.")).toBeVisible();
  await expect(page.getByText("Give your family tree a name.")).toBeVisible();
});
