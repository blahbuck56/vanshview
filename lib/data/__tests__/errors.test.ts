import { describe, expect, it } from "vitest";
import { errorMessage } from "@/lib/data/family";

describe("errorMessage", () => {
  it("passes through the messages our database functions raise", () => {
    expect(errorMessage({ message: "A person can have at most two biological parents" })).toBe(
      "A person can have at most two biological parents",
    );
  });
  it("translates permission, link, session and network errors", () => {
    expect(errorMessage({ message: 'new row violates row-level security policy for table "persons"' })).toMatch(/permission/);
    expect(errorMessage({ message: 'invalid input syntax for type uuid: "abc"' })).toMatch(/link/);
    expect(errorMessage({ message: "JWT expired" })).toMatch(/sign in again/);
    expect(errorMessage({ message: "TypeError: Failed to fetch" })).toMatch(/connection/);
  });
  it("never shows raw database internals", () => {
    expect(errorMessage({ message: 'duplicate key value violates unique constraint "x"' })).not.toMatch(/constraint/);
    expect(errorMessage(null)).toMatch(/Something went wrong/);
  });
});
