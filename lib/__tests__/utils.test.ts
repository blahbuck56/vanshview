import { describe, expect, it } from "vitest";
import { safeNext, sendCodeError } from "@/lib/utils";

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

describe("sendCodeError", () => {
  it("explains waits, failed robot checks and bad numbers", () => {
    expect(sendCodeError("For security purposes, you can only request this after 3 seconds.")).toMatch(/wait a few seconds/);
    expect(sendCodeError("captcha protection: request disallowed (timeout-or-duplicate)")).toMatch(/robot check/);
    expect(sendCodeError("Invalid phone number format")).toMatch(/couldn't send a code/);
  });
});
