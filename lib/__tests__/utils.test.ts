import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/utils";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/join/abc")).toBe("/join/abc");
    expect(safeNext("/s/123?focus=9")).toBe("/s/123?focus=9");
  });
  it("falls back to home for anything else", () => {
    for (const bad of [null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)"]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
