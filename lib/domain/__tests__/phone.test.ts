import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { E164_PATTERN, formatPhone, normalizePhone } from "../phone";

describe("normalizePhone", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["098765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["0091 98765 43210", "+919876543210"],
    ["020 2553 0100", "+912025530100"], // Pune landline
    ["+44 7911 123022", "+447911123022"],
    ["+971 50 100 0005", "+971501000005"],
  ])("%s -> %s", (input, e164) => {
    const r = normalizePhone(input);
    expect(r).toEqual({ ok: true, e164 });
    expect(E164_PATTERN.test(e164)).toBe(true);
  });

  it("uses a different default country when asked", () => {
    expect(normalizePhone("(732) 555-0108", "US")).toEqual({ ok: true, e164: "+17325550108" });
  });

  it.each([
    ["", "phone.empty"],
    ["   ", "phone.empty"],
    ["98765", "phone.invalid"],
    ["9999999999999999", "phone.invalid"],
    ["not a number", "phone.invalid"],
  ])("rejects %j", (input, error) => {
    expect(normalizePhone(input)).toEqual({ ok: false, error });
  });

  it("every phone number in the seed is one the app would accept", () => {
    const seed = readFileSync(path.resolve(__dirname, "../../../supabase/seed.sql"), "utf8");
    const numbers = [...new Set(seed.match(/\+\d{8,15}/g))];
    expect(numbers.length).toBeGreaterThan(30);
    for (const n of numbers) expect(normalizePhone(n), n).toEqual({ ok: true, e164: n });
  });

  it("formats for display", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
  });
});
