import type { Relatives } from "@/lib/data/family";

/**
 * Who a new child's other parent probably is: the one current partner (a divorced or late
 * partner is never assumed), or "none" when there are no partners. null = ask.
 */
export function defaultOtherParent(partners: Relatives["partners"]): string | null {
  if (partners.length === 0) return "none";
  const current = partners.filter((p) => !p.union.endReason);
  if (current.length === 1) return current[0].person.id;
  if (partners.length === 1) return partners[0].person.id;
  return null;
}
