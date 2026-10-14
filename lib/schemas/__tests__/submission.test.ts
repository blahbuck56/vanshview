import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SubmissionPayloadSchema, type SubmissionPayloadInput } from "../submission";

const where = { label: "Delhi", kind: "current" as const };

const base = (): SubmissionPayloadInput => ({
  submitter: { temp_id: "me", given_name: "Poonam", location: where, phone: "+919810000050" },
  persons: [
    { temp_id: "husband", given_name: "Ashok", location: { label: "Delhi", kind: "death" }, is_deceased: true },
    { temp_id: "son", given_name: "Rohan", location: where, phone: "+447911123022" },
  ],
  parent_child: [
    { parent_temp_id: "me", child_temp_id: "son", kind: "biological" },
    { parent_temp_id: "husband", child_temp_id: "son", kind: "biological" },
  ],
  unions: [{ member_temp_ids: ["me", "husband"], kind: "marriage", end_reason: "death" }],
});

const messages = (input: unknown) => {
  const r = SubmissionPayloadSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("SubmissionPayload", () => {
  it("accepts a well-formed payload and fills defaults", () => {
    const r = SubmissionPayloadSchema.parse(base());
    expect(r.media).toEqual([]);
    expect(r.notes).toBe("");
  });

  it("accepts references to people already in the tree", () => {
    const p = base();
    p.persons!.push({ temp_id: "aunt", existing_person_id: "3e10a678-b4ff-676e-3869-a1971805b202" });
    p.parent_child!.push({ parent_temp_id: "aunt", child_temp_id: "son", kind: "guardian" });
    expect(SubmissionPayloadSchema.safeParse(p).success).toBe(true);
  });

  it("the submitter cannot skip their own phone", () => {
    const p = base();
    p.submitter = { temp_id: "me", given_name: "Poonam", location: where, phone_status: "requested" };
    expect(messages(p)).toContain("phone.required_for_self");
  });

  it("rejects dangling, duplicate and self references", () => {
    const p = base();
    p.persons!.push({ temp_id: "son", given_name: "Again", location: where, phone: "+919000000003" });
    p.parent_child!.push({ parent_temp_id: "ghost", child_temp_id: "son", kind: "biological" });
    p.parent_child!.push({ parent_temp_id: "son", child_temp_id: "son", kind: "adoptive" });
    p.unions!.push({ member_temp_ids: ["me", "me"], kind: "marriage" });
    expect(messages(p)).toEqual(
      expect.arrayContaining(["temp_id.duplicate", "temp_id.unknown", "parent_child.self", "union.same_person"]),
    );
  });

  it("rejects a third biological parent within the payload", () => {
    const p = base();
    p.persons!.push({ temp_id: "other", given_name: "Other", location: where, phone: "+919000000004" });
    p.parent_child!.push({ parent_temp_id: "other", child_temp_id: "son", kind: "biological" });
    expect(messages(p)).toContain("parent_child.max_two_biological");
  });

  it("invites need an email or a phone", () => {
    const p = base();
    p.invites = [{ name: "Kritika" }];
    expect(messages(p)).toContain("invite.contact_required");
  });

  it("both seed submissions satisfy the contract", () => {
    const seed = readFileSync(path.resolve(__dirname, "../../../supabase/seed.sql"), "utf8");
    const payloads = [...seed.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map((m) => JSON.parse(m[1]));
    expect(payloads).toHaveLength(2);
    for (const payload of payloads) {
      const r = SubmissionPayloadSchema.safeParse(payload);
      expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    }
  });
});
