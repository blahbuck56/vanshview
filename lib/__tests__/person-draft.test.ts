import { describe, expect, it } from "vitest";
import { draftToPayload, emptyDraft } from "@/lib/person-draft";

const child = emptyDraft({ givenName: "Kiara", place: "Pune" });

describe("draftToPayload", () => {
  it("a child with no phone and no birth year is saved with the phone marked missing, not blocked", () => {
    const r = draftToPayload(child, { allowAskLater: true, phoneOptional: true });
    expect(r.ok && r.value.phone_status).toBe("requested");
    expect(draftToPayload(child, { allowAskLater: true }).ok).toBe(false);
  });
  it("sends the family name at birth, and null to clear it", () => {
    const r = draftToPayload({ ...child, birthFamilyName: " Sharma ", under18: true }, { allowAskLater: true });
    expect(r.ok && r.value.birth_family_name).toBe("Sharma");
    const cleared = draftToPayload({ ...child, under18: true }, { allowAskLater: true });
    expect(cleared.ok && cleared.value.birth_family_name).toBeNull();
  });
  it("your own phone can't be skipped, and the message says so", () => {
    const r = draftToPayload(child, { allowAskLater: false, phoneOptional: true });
    expect(!r.ok && r.errors.phone).toBe("Your own phone number is needed.");
  });
});
