// English copy for validation keys. Hindi lands in Phase 5 as a sibling file.
const messages: Record<string, string> = {
  "name.required": "Add a first name.",
  "location.required": "Add where they live (or lived).",
  "phone.required": "Add a phone number, or tap “Ask later”.",
  "phone.required_for_self": "Your own phone number is needed.",
  "phone.invalid": "That doesn't look like a valid phone number.",
  "email.invalid": "That doesn't look like a valid email.",
  "death.requires_deceased": "Mark them as passed away to add a death date.",
  "death.before_birth": "The death date is before the birth date.",
  "date.unrecognised": "Try “1952”, “about 1950”, “March 1952” or “14/03/1952”.",
  "date.invalid": "That date doesn't exist.",
  "date.future": "That date is in the future.",
  "date.too_old": "That year looks too early.",
};

export function t(key: string): string {
  return messages[key] ?? key;
}
