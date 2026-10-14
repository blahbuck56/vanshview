import { describe, expect, it } from "vitest";
import { computeIsMinor } from "../minor";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const year = (y: number) => ({ date: `${y}-01-01`, precision: "year" as const, qualifier: "exact" as const });
const day = (d: string) => ({ date: d, precision: "day" as const, qualifier: "exact" as const });

// Same cases as compute_is_minor in supabase/tests/02_integrity.test.sql.
describe("computeIsMinor (mirrors SQL compute_is_minor)", () => {
  it("year-only births stay minor until the end of their 18th year", () => {
    expect(computeIsMinor({ birth: year(2008), isDeceased: false }, at("2026-12-30"))).toBe(true);
    expect(computeIsMinor({ birth: year(2008), isDeceased: false }, at("2026-12-31"))).toBe(false);
  });

  it("exact births turn adult on the 18th birthday", () => {
    expect(computeIsMinor({ birth: day("2008-10-14"), isDeceased: false }, at("2026-10-13"))).toBe(true);
    expect(computeIsMinor({ birth: day("2008-10-14"), isDeceased: false }, at("2026-10-14"))).toBe(false);
  });

  it("falls back to the explicit override when the birth date is too vague", () => {
    const decade = { date: "2010-01-01", precision: "decade" as const, qualifier: "exact" as const };
    expect(computeIsMinor({ birth: decade, minorOverride: true, isDeceased: false })).toBe(true);
    expect(computeIsMinor({ birth: null, minorOverride: null, isDeceased: false })).toBe(false);
  });

  it("the deceased are never minors", () => {
    expect(computeIsMinor({ birth: year(2015), isDeceased: true }, at("2026-10-14"))).toBe(false);
  });
});
