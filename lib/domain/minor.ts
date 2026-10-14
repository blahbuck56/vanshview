import { fuzzyDateEnd, type FuzzyDate } from "./dates";

/**
 * Mirrors public.compute_is_minor. Uses the END of the birth period, so "born 2008" counts
 * as a minor until 31 Dec 2026: for privacy the uncertain case errs towards "minor".
 * Decade-precision or unknown births fall back to the explicit "under 18" override.
 */
export function computeIsMinor(
  input: { birth: FuzzyDate | null | undefined; minorOverride?: boolean | null; isDeceased: boolean },
  today: Date = new Date(),
): boolean {
  const { birth, minorOverride, isDeceased } = input;
  if (isDeceased) return false;
  if (birth && birth.date && ["day", "month", "year"].includes(birth.precision)) {
    const end = fuzzyDateEnd(birth)!;
    const [y, m, d] = end.split("-").map(Number);
    const adultFrom = new Date(Date.UTC(y + 18, m - 1, d));
    // Feb 29 births: Date.UTC rolls 29 Feb of a non-leap year to 1 Mar, matching Postgres' + interval.
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    return adultFrom.getTime() > todayUtc;
  }
  return minorOverride ?? false;
}
