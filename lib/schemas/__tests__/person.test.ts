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
    // Your own missing phone says so, rather than offering an "Ask later" that isn't there.
    expect(issues(strict.safeParse({ given_name: "Meenakshi", location: where }))).toEqual(["phone:phone.required_for_self"]);
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

describe("names from every family", () => {
  const ok = (given: string, family?: string) =>
    schema.safeParse({ given_name: given, family_name: family, location: where, phone: "+919876500001" });

  it("accepts apostrophes, hyphens, Devanagari, Gurmukhi, Urdu, accents and emoji", () => {
    for (const [given, family] of [
      ["Rose", "D'Souza"],
      ["Mary", "D’Souza"],
      ["Anne-Marie", "Fernandes-Rao"],
      ["नीलम", "मल्होत्रा"],
      ["ਗੁਰਪ੍ਰੀਤ", "ਸਿੰਘ"],
      ["زینب", "خان"],
      ["José", "Gonçalves"],
      ["Baby 🌸", undefined],
    ] as const) {
      const r = ok(given, family);
      expect(r.success, `${given} ${family ?? ""}`).toBe(true);
      expect(r.data?.given_name).toBe(given);
    }
  });

  it("stores one form of each letter, whichever keyboard typed it", () => {
    const decomposed = "José"; // e + combining accent, as macOS can send it
    expect(ok(decomposed).data?.given_name).toBe("José");
  });

  it("trims spaces but keeps a 100-character limit in characters", () => {
    expect(ok("  Kabir  ").data?.given_name).toBe("Kabir");
    expect(ok("न".repeat(100)).success).toBe(true);
    expect(ok("न".repeat(101)).success).toBe(false);
  });
});
