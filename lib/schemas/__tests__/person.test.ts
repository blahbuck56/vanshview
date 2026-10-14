import { describe, expect, it } from "vitest";
import { personFieldsSchema, PersonFieldsSchema } from "../person";

const today = new Date("2026-10-14T00:00:00Z");
const schema = personFieldsSchema({ allowAskLater: true, today });
const strict = personFieldsSchema({ allowAskLater: false, today });

const where = { label: "Pune", kind: "current" as const };
const year = (y: number) => ({ date: `${y}-01-01`, precision: "year" as const, qualifier: "exact" as const });

const issues = (r: ReturnType<typeof schema.safeParse>) =>
  r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}:${i.message}`);

describe("spec 3a required fields", () => {
  it("living adult: name, location and phone", () => {
    expect(schema.safeParse({ given_name: "Arjun", location: where, phone: "+919876500001" }).success).toBe(true);
    expect(issues(schema.safeParse({ given_name: "Arjun", location: where }))).toEqual(["phone:phone.required"]);
  });

  it("living adult may skip the phone with 'ask later', except the submitter", () => {
    const askLater = { given_name: "Meenakshi", location: where, phone_status: "requested" as const };
    expect(schema.safeParse(askLater).success).toBe(true);
    expect(issues(strict.safeParse(askLater))).toEqual(["phone:phone.required_for_self"]);
  });

  it("living minor: no phone needed (from birth date or the under-18 checkbox)", () => {
    expect(schema.safeParse({ given_name: "Kabir", location: where, birth: year(2021) }).success).toBe(true);
    expect(schema.safeParse({ given_name: "Kabir", location: where, minor_override: true }).success).toBe(true);
  });

  it("deceased: phone is never kept", () => {
    const r = PersonFieldsSchema.parse({ given_name: "Mohan", location: where, is_deceased: true, phone: "+919000000001" });
    expect(r.phone).toBeNull();
  });

  it("name and location are required unless the person is a placeholder", () => {
    expect(issues(schema.safeParse({ is_deceased: true }))).toEqual([
      "given_name:name.required",
      "location:location.required",
    ]);
    expect(schema.safeParse({ is_placeholder: true }).success).toBe(true);
  });

  it("dates must be consistent", () => {
    expect(issues(schema.safeParse({ given_name: "X", location: where, death: year(2001) }))).toContain(
      "death:death.requires_deceased",
    );
    expect(
      issues(
        schema.safeParse({
          given_name: "X",
          location: where,
          is_deceased: true,
          birth: { date: "2000-05-01", precision: "day", qualifier: "exact" },
          death: { date: "1999-05-01", precision: "day", qualifier: "exact" },
        }),
      ),
    ).toContain("death:death.before_birth");
  });

  it("rejects malformed values", () => {
    expect(issues(schema.safeParse({ given_name: "X", location: where, phone: "98765 43210" }))).toContain(
      "phone:phone.invalid",
    );
    expect(
      schema.safeParse({ given_name: "X", location: where, phone: "+919000000001", birth: { date: "1920-05-05", precision: "year" } })
        .success,
    ).toBe(false);
  });
});
