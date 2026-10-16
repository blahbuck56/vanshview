import { describe, expect, it } from "vitest";
import { maskPhones } from "../sentry";

describe("maskPhones", () => {
  it("masks phone numbers anywhere in an error report", () => {
    const event = {
      message: "Could not invite +91 98765 43210",
      extra: { phones: ["+919876543210", "98765-43210"], count: 3 },
      request: { url: "/s/123e4567-e89b-12d3-a456-426614174000?focus=1" },
    };
    expect(maskPhones(event)).toEqual({
      message: "Could not invite [phone]",
      extra: { phones: ["[phone]", "[phone]"], count: 3 },
      request: { url: "/s/123e4567-e89b-12d3-a456-426614174000?focus=1" },
    });
  });

  it("leaves years, short numbers and non-strings alone", () => {
    expect(maskPhones({ born: "1952", code: 123456, ok: true, none: null })).toEqual({ born: "1952", code: 123456, ok: true, none: null });
  });
});
