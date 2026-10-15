import { describe, expect, it } from "vitest";
import type { Relatives } from "@/lib/data/family";
import { defaultOtherParent } from "@/lib/domain/relatives";

const partner = (id: string, endReason: "divorce" | "death" | null = null) =>
  ({ person: { id }, union: { endReason } }) as unknown as Relatives["partners"][number];

describe("defaultOtherParent", () => {
  it("no partners: someone else / unknown", () => expect(defaultOtherParent([])).toBe("none"));
  it("one partner: them", () => expect(defaultOtherParent([partner("a")])).toBe("a"));
  it("a divorced partner and a current one: the current one", () => {
    expect(defaultOtherParent([partner("ex", "divorce"), partner("now")])).toBe("now");
  });
  it("two current partners: ask", () => expect(defaultOtherParent([partner("a"), partner("b")])).toBeNull());
  it("only past partners: ask", () => expect(defaultOtherParent([partner("a", "divorce"), partner("b", "death")])).toBeNull());
});
