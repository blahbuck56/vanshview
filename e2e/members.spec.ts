import { expect, test } from "@playwright/test";
import { SEED, adult, api, completeLogin, fresh, joinViaInvite, newFamily, openPerson, panel, rpc, signIn } from "./support";

// Invites, joining, "This is me", roles, removing members, and keeping families apart.

test("invite link → join → find yourself → “This is me” → add your family", async ({ page, browser }) => {
  const { spaceId, meId, db } = await newFamily(fresh(11), "Invite family", { given_name: "Owner" });
  // The person who will join is already in the tree, added without a phone.
  const joiner = await rpc(db, "add_sibling", { p_person_id: meId, p_new: adult("Joiner") });

  await signIn(page, fresh(11));
  await page.goto(`/s/${spaceId}/members`);
  await page.getByRole("radio", { name: "Editor" }).click();
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = (await page.locator("li span.font-mono").first().textContent())!.trim();
  expect(link).toContain("/join/");
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /wa\.me.*join/);

  const ctx = await browser.newContext();
  const them = await ctx.newPage();
  await them.goto(new URL(link).pathname);
  await expect(them).toHaveURL(/\/login\?next=/); // sign in first, then back to the invite
  await completeLogin(them, fresh(12));
  await expect(them.getByRole("heading", { name: /invited to the Invite family tree/ })).toBeVisible();
  await expect(them.getByText(/join as an editor/)).toBeVisible();
  await them.getByRole("button", { name: "Join the family" }).click();
  await expect(them).toHaveURL(/\/s\//);

  // Not linked to anyone yet: a welcome note explains, and the wizard asks them to pick themselves.
  await expect(them.getByRole("note")).toContainText("Which one is you?");
  await them.getByRole("link", { name: "Add family" }).click();
  await expect(them.getByText(/First find yourself in the tree/)).toBeVisible();

  await them.getByRole("button", { name: "Open the tree" }).click();
  await them.getByPlaceholder("Find anyone in the family").fill("Joiner");
  await them.getByRole("banner").getByRole("button", { name: /Joiner Shah/ }).click();
  await them.getByRole("button", { name: "This is me" }).click();
  await expect(them.getByRole("status").filter({ hasText: "Linked to your account" })).toBeVisible();
  await expect(them.getByRole("note")).toHaveCount(0);
  await expect(panel(them).getByText("You", { exact: true })).toBeVisible();
  await expect(panel(them).getByText("+91 99999 00012")).toBeVisible(); // sign-in phone filled in

  await them.getByRole("link", { name: "Add family" }).click();
  await expect(them.getByRole("heading", { name: "Your parents" })).toBeVisible();

  // The owner sees who joined, with their phone.
  await page.reload();
  await expect(page.getByText("Joiner Shah")).toBeVisible();
  await expect(page.getByText(/\+91 99999 00012/)).toBeVisible();

  // Opening the link again says you're already in.
  await them.goto(new URL(link).pathname);
  await expect(them.getByRole("heading", { name: /already in Invite family/ })).toBeVisible();

  // A turned-off link stops working.
  await page.getByRole("button", { name: "Turn off" }).first().click();
  await expect(page.locator("li span.font-mono")).toHaveCount(0);
  const late = await browser.newContext();
  const latePage = await late.newPage();
  await signIn(latePage, fresh(13));
  await latePage.goto(new URL(link).pathname);
  await expect(latePage.getByRole("heading", { name: "This invite link no longer works" })).toBeVisible();
  await late.close();
  await ctx.close();
  expect(joiner).toBeTruthy();
});

test("roles: viewers can't change anything, editors can't manage members, admins can change roles and remove people", async ({ page, browser }) => {
  const { spaceId, meId, db } = await newFamily(fresh(14), "Roles family", { given_name: "Admin" });
  await joinViaInvite(db, spaceId, fresh(15), "viewer");
  await joinViaInvite(db, spaceId, fresh(16), "editor");

  // Viewer
  const viewerCtx = await browser.newContext();
  const viewer = await viewerCtx.newPage();
  await signIn(viewer, fresh(15));
  await openPerson(viewer, spaceId, meId);
  await expect(panel(viewer).getByRole("heading", { name: "Admin Shah" })).toBeVisible();
  await expect(panel(viewer).getByText("Add a relative")).toHaveCount(0);
  await expect(panel(viewer).getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(viewer.getByRole("link", { name: "Add family" })).toHaveCount(0);
  // ...and the database refuses even if the buttons were there.
  const viewerDb = await api(fresh(15));
  const { error } = await viewerDb.rpc("update_person", { p_person_id: meId, p: { given_name: "Hacked" } as never });
  expect(error?.message).toMatch(/Only editors/);

  // Editor: can add, can't manage members.
  const editorCtx = await browser.newContext();
  const editor = await editorCtx.newPage();
  await signIn(editor, fresh(16));
  await openPerson(editor, spaceId, meId);
  await expect(panel(editor).getByText("Add a relative")).toBeVisible();
  await expect(panel(editor).getByRole("button", { name: "Edit" })).toHaveCount(0); // Admin's own claimed profile
  await editor.goto(`/s/${spaceId}/members`);
  await expect(editor.getByRole("button", { name: "Create invite link" })).toHaveCount(0);
  await expect(editor.getByRole("combobox", { name: "Role" })).toHaveCount(0);

  // Admin: promote the viewer to editor; the viewer can now add people.
  await signIn(page, fresh(14));
  await page.goto(`/s/${spaceId}/members`);
  const rows = page.getByRole("listitem").filter({ hasText: "+91 99999 00015" });
  await rows.getByRole("combobox", { name: "Role" }).selectOption("editor");
  await expect(rows.getByText("Can add and edit people")).toBeVisible();
  await viewer.reload();
  await expect(panel(viewer).getByText("Add a relative")).toBeVisible();

  // Admin removes the editor; they lose access straight away.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("listitem").filter({ hasText: "+91 99999 00016" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("+91 99999 00016")).toHaveCount(0);
  await editor.reload();
  await expect(editor.getByRole("heading", { name: "You can't open this family" })).toBeVisible();

  await viewerCtx.close();
  await editorCtx.close();
});

test("families are kept apart, and one person can be in several", async ({ page }) => {
  const a = await newFamily(fresh(17), "First family", { given_name: "Multi" });
  const other = await newFamily(fresh(18), "Someone else's family", { given_name: "Stranger" });
  await joinViaInvite(other.db, other.spaceId, fresh(17), "viewer");
  const secret = await newFamily(fresh(19), "Private family", { given_name: "Secret" });

  await signIn(page, fresh(17));
  await page.goto(`/s/${a.spaceId}`);
  await page.getByRole("combobox", { name: "Family" }).selectOption({ label: "Someone else's family" });
  await expect(page).toHaveURL(new RegExp(other.spaceId));
  await expect(panel(page).getByRole("heading", { name: "Stranger Shah" })).toBeVisible();

  // Not a member: no data, a clear message.
  await page.goto(`/s/${secret.spaceId}?focus=${secret.meId}`);
  await expect(page.getByRole("heading", { name: "You can't open this family" })).toBeVisible();
  await expect(page.getByText("Secret Shah")).toHaveCount(0);
  const db = await api(fresh(17));
  const { data } = await db.from("persons").select("id").eq("space_id", secret.spaceId);
  expect(data).toEqual([]);

  // A mistyped link.
  await page.goto(`/s/not-a-family`);
  await expect(page.getByText("This link doesn't look right")).toBeVisible();

  // Start another family from the header, and back out.
  await page.goto(`/s/${a.spaceId}`);
  await page.getByRole("combobox", { name: "Family" }).selectOption({ label: "+ Start another family" });
  await expect(page).toHaveURL(/\/start/);
  await page.getByRole("link", { name: "Back to your family" }).click();
  await expect(page).toHaveURL(/\/s\//);
  expect(SEED.owner).toBeTruthy();
});
