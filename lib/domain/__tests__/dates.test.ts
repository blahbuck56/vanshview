import { describe, expect, it } from "vitest";
import { formatFuzzyDate, formatLifespan, fuzzyDateEnd, isNormalised, parseFuzzyDate } from "../dates";

const today = new Date("2026-10-14T12:00:00Z");
const parse = (s: string) => parseFuzzyDate(s, today);

describe("parseFuzzyDate", () => {
  it.each([
    ["1952", "1952-01-01", "year", "exact"],
    ["about 1950", "1950-01-01", "year", "about"],
    ["~1950", "1950-01-01", "year", "about"],
    ["c. 1950", "1950-01-01", "year", "about"],
    ["circa 1950", "1950-01-01", "year", "about"],
    ["March 1952", "1952-03-01", "month", "exact"],
    ["mar. 1952", "1952-03-01", "month", "exact"],
    ["1952-03", "1952-03-01", "month", "exact"],
    ["03/1952", "1952-03-01", "month", "exact"],
    ["14 March 1952", "1952-03-14", "day", "exact"],
    ["14th Mar 1952", "1952-03-14", "day", "exact"],
    ["March 14, 1952", "1952-03-14", "day", "exact"],
    ["1952-03-14", "1952-03-14", "day", "exact"],
    ["14/03/1952", "1952-03-14", "day", "exact"],
    ["1950s", "1950-01-01", "decade", "exact"],
    ["about 1940s", "1940-01-01", "decade", "about"],
    ["before 1900", "1900-01-01", "year", "before"],
    ["after March 1920", "1920-03-01", "month", "after"],
    ["  ABOUT   1950 ", "1950-01-01", "year", "about"],
  ])("%s", (input, date, precision, qualifier) => {
    expect(parse(input)).toEqual({ ok: true, value: { date, precision, qualifier } });
  });

  it.each(["", "unknown", "?", "Don't know"])("treats %j as unknown", (input) => {
    expect(parse(input)).toEqual({ ok: true, value: { date: null, precision: "unknown", qualifier: "exact" } });
  });

  it.each([
    ["31/02/1950", "date.invalid"],
    ["1955s", "date.invalid"],
    ["13/1950", "date.invalid"],
    ["Smarch 1950", "date.unrecognised"],
    ["last year", "date.unrecognised"],
    ["2030", "date.future"],
    ["0999", "date.too_old"],
  ])("rejects %j (%s)", (input, error) => {
    expect(parse(input)).toEqual({ ok: false, error });
  });

  it("every parsed value is normalised the way the database requires", () => {
    for (const s of ["1952", "March 1952", "14 March 1952", "1950s"]) {
      const r = parse(s);
      expect(r.ok && isNormalised(r.value)).toBe(true);
    }
  });
});

describe("fuzzyDateEnd (mirrors SQL fuzzy_date_end)", () => {
  it("covers the whole period", () => {
    expect(fuzzyDateEnd({ date: "1952-02-01", precision: "month", qualifier: "exact" })).toBe("1952-02-29");
    expect(fuzzyDateEnd({ date: "1920-01-01", precision: "year", qualifier: "exact" })).toBe("1920-12-31");
    expect(fuzzyDateEnd({ date: "1950-01-01", precision: "decade", qualifier: "exact" })).toBe("1959-12-31");
    expect(fuzzyDateEnd({ date: null, precision: "unknown", qualifier: "exact" })).toBeNull();
  });
});

describe("isNormalised", () => {
  it("rejects mid-period dates", () => {
    expect(isNormalised({ date: "1920-05-05", precision: "year", qualifier: "exact" })).toBe(false);
    expect(isNormalised({ date: "1955-01-01", precision: "decade", qualifier: "exact" })).toBe(false);
    expect(isNormalised({ date: "1920-01-01", precision: "unknown", qualifier: "exact" })).toBe(false);
  });
});

describe("formatting", () => {
  it("formats for the tree and for detail views", () => {
    const about = { date: "1932-01-01", precision: "year", qualifier: "about" } as const;
    const day = { date: "1928-03-14", precision: "day", qualifier: "exact" } as const;
    expect(formatFuzzyDate(about, "year")).toBe("~1932");
    expect(formatFuzzyDate(day, "full")).toBe("14 Mar 1928");
    expect(formatFuzzyDate(day, "year")).toBe("1928");
    expect(formatFuzzyDate({ date: "1950-01-01", precision: "decade", qualifier: "exact" })).toBe("1950s");
    expect(formatFuzzyDate({ date: "1900-01-01", precision: "year", qualifier: "before" })).toBe("before 1900");
  });

  it("formats lifespans the way the mock shows them", () => {
    const y = (n: number, q: "exact" | "about" = "exact") => ({ date: `${n}-01-01`, precision: "year" as const, qualifier: q });
    expect(formatLifespan(y(1932, "about"), y(2009), true)).toBe("~1932–2009");
    expect(formatLifespan(y(1991), null, false)).toBe("b. 1991");
    expect(formatLifespan(null, y(2001), true)).toBe("d. 2001");
    expect(formatLifespan(null, null, true)).toBe("Passed away");
  });
});
