import type { Database } from "@/types/database";

export type DatePrecision = Database["public"]["Enums"]["date_precision"];
export type DateQualifier = Database["public"]["Enums"]["date_qualifier"];

/**
 * A genealogical date. `date` is ISO (YYYY-MM-DD) normalised to the START of its period:
 * "1920" -> 1920-01-01 (year), "March 1952" -> 1952-03-01 (month), "1950s" -> 1950-01-01 (decade).
 * Mirrors the persons/unions columns and the fuzzy_date_* SQL helpers.
 */
export type FuzzyDate = {
  date: string | null;
  precision: DatePrecision;
  qualifier: DateQualifier;
};

export const UNKNOWN_DATE: FuzzyDate = { date: null, precision: "unknown", qualifier: "exact" };

/** Error codes, not copy: the UI maps them to English / Hindi strings. */
export type DateParseError = "date.unrecognised" | "date.invalid" | "date.future" | "date.too_old";

export type DateParseResult = { ok: true; value: FuzzyDate } | { ok: false; error: DateParseError };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const QUALIFIER_PREFIXES: Array<[RegExp, DateQualifier]> = [
  [/^(?:~|about|abt\.?|approx\.?|approximately|around|circa|ca\.?|c\.)\s*/, "about"],
  [/^(?:before|bef\.?)\s+/, "before"],
  [/^(?:after|aft\.?)\s+/, "after"],
];

const UNKNOWN_INPUTS = new Set(["", "?", "unknown", "don't know", "dont know", "not sure"]);

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const iso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function monthFromName(name: string): number | null {
  return MONTHS[name.replace(/\.$/, "")] ?? null;
}

/**
 * Parses what people actually type: "1952", "about 1950", "~1950", "March 1952", "Mar 1952",
 * "14 March 1952", "March 14, 1952", "1952-03-14", "14/03/1952" (day first), "03/1952",
 * "1950s", "before 1900", "after 1920". Empty or "unknown" gives an unknown date.
 */
export function parseFuzzyDate(input: string, today: Date = new Date()): DateParseResult {
  let s = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (UNKNOWN_INPUTS.has(s)) return { ok: true, value: UNKNOWN_DATE };

  let qualifier: DateQualifier = "exact";
  for (const [pattern, q] of QUALIFIER_PREFIXES) {
    if (pattern.test(s)) {
      qualifier = q;
      s = s.replace(pattern, "");
      break;
    }
  }

  let y: number | null = null;
  let m = 1;
  let d = 1;
  let precision: DatePrecision;
  let match: RegExpMatchArray | null;

  if ((match = s.match(/^(\d{4})'?s$/))) {
    y = Number(match[1]);
    if (y % 10 !== 0) return { ok: false, error: "date.invalid" };
    precision = "decade";
  } else if ((match = s.match(/^(\d{4})$/))) {
    y = Number(match[1]);
    precision = "year";
  } else if ((match = s.match(/^(\d{4})-(\d{1,2})$/))) {
    y = Number(match[1]);
    m = Number(match[2]);
    precision = "month";
  } else if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
    precision = "day";
  } else if ((match = s.match(/^([a-z]+\.?),? (\d{4})$/))) {
    const month = monthFromName(match[1]);
    if (month === null) return { ok: false, error: "date.unrecognised" };
    y = Number(match[2]);
    m = month;
    precision = "month";
  } else if ((match = s.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+\.?),? (\d{4})$/))) {
    const month = monthFromName(match[2]);
    if (month === null) return { ok: false, error: "date.unrecognised" };
    y = Number(match[3]);
    m = month;
    d = Number(match[1]);
    precision = "day";
  } else if ((match = s.match(/^([a-z]+\.?) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/))) {
    const month = monthFromName(match[1]);
    if (month === null) return { ok: false, error: "date.unrecognised" };
    y = Number(match[3]);
    m = month;
    d = Number(match[2]);
    precision = "day";
  } else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
    // Day first, as written in India and the UK.
    y = Number(match[3]);
    m = Number(match[2]);
    d = Number(match[1]);
    precision = "day";
  } else if ((match = s.match(/^(\d{1,2})[/.-](\d{4})$/))) {
    y = Number(match[2]);
    m = Number(match[1]);
    precision = "month";
  } else {
    return { ok: false, error: "date.unrecognised" };
  }

  if (!isRealDate(y, m, d)) return { ok: false, error: "date.invalid" };
  if (y < 1000) return { ok: false, error: "date.too_old" };

  const value: FuzzyDate = { date: iso(y, m, d), precision, qualifier };
  const todayIso = today.toISOString().slice(0, 10);
  if (value.date! > todayIso) return { ok: false, error: "date.future" };
  return { ok: true, value };
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

/** Last day covered by a fuzzy date; mirrors public.fuzzy_date_end. */
export function fuzzyDateEnd(fd: FuzzyDate): string | null {
  if (!fd.date || fd.precision === "unknown") return null;
  const [y, m] = parts(fd.date);
  switch (fd.precision) {
    case "day":
      return fd.date;
    case "month":
      return iso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());
    case "year":
      return iso(y, 12, 31);
    case "decade":
      return iso(y + 9, 12, 31);
    default:
      return null;
  }
}

/** Mirrors public.fuzzy_date_is_normalised. */
export function isNormalised(fd: FuzzyDate): boolean {
  if (fd.precision === "unknown") return fd.date === null;
  if (!fd.date || !/^\d{4}-\d{2}-\d{2}$/.test(fd.date)) return false;
  const [y, m, d] = parts(fd.date);
  if (!isRealDate(y, m, d)) return false;
  switch (fd.precision) {
    case "day":
      return true;
    case "month":
      return d === 1;
    case "year":
      return d === 1 && m === 1;
    case "decade":
      return d === 1 && m === 1 && y % 10 === 0;
    default:
      return false;
  }
}

const QUALIFIER_LABEL: Record<DateQualifier, string> = { exact: "", about: "~", before: "before ", after: "after " };

/** Display form. "year" style is what the tree uses: "~1932", "1950s", "before 1900". */
export function formatFuzzyDate(fd: FuzzyDate | null | undefined, style: "year" | "full" = "full"): string {
  if (!fd || !fd.date || fd.precision === "unknown") return "";
  const [y, m, d] = parts(fd.date);
  let body: string;
  if (fd.precision === "decade") body = `${y}s`;
  else if (style === "year" || fd.precision === "year") body = String(y);
  else if (fd.precision === "month") body = `${MONTH_LABELS[m - 1]} ${y}`;
  else body = `${d} ${MONTH_LABELS[m - 1]} ${y}`;
  return QUALIFIER_LABEL[fd.qualifier] + body;
}

/** "1928–2001", "~1932–2009", "b. 1991", "d. 2001", or "" when nothing is known. */
export function formatLifespan(
  birth: FuzzyDate | null | undefined,
  death: FuzzyDate | null | undefined,
  isDeceased: boolean,
): string {
  const b = formatFuzzyDate(birth, "year");
  const d = formatFuzzyDate(death, "year");
  if (!isDeceased) return b ? `b. ${b}` : "";
  if (b && d) return `${b}–${d}`;
  if (b) return `${b}–`;
  if (d) return `d. ${d}`;
  return "Passed away";
}
