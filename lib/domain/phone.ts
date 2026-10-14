import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Same pattern as the persons_phone_e164 CHECK constraint. */
export const E164_PATTERN = /^\+[1-9][0-9]{6,14}$/;

export const DEFAULT_PHONE_COUNTRY: CountryCode = "IN";

export type PhoneResult = { ok: true; e164: string } | { ok: false; error: "phone.empty" | "phone.invalid" };

/** Normalises user input to E.164. National numbers are read as Indian unless told otherwise. */
export function normalizePhone(input: string, defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY): PhoneResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "phone.empty" };
  const candidate = raw.replace(/^00(?=[1-9])/, "+");
  const parsed = parsePhoneNumberFromString(candidate, defaultCountry);
  if (!parsed || !parsed.isValid()) return { ok: false, error: "phone.invalid" };
  return { ok: true, e164: parsed.number };
}

/** "+91 98765 43210" style display for a stored E.164 number. */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
