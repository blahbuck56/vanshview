import { formatFuzzyDate, parseFuzzyDate } from "@/lib/domain/dates";
import { computeIsMinor } from "@/lib/domain/minor";
import { normalizePhone } from "@/lib/domain/phone";
import { t } from "@/lib/i18n/en";
import type { Person } from "@/lib/data/family";
import { personFieldsSchema, type PersonFieldsInput } from "@/lib/schemas/person";

/** What a person form holds while someone types: plain strings, parsed on save. */
export type PersonDraft = {
  givenName: string;
  familyName: string;
  gender: "male" | "female" | "other" | "unknown";
  living: boolean;
  born: string;
  died: string;
  place: string;
  phone: string;
  askLater: boolean;
  under18: boolean;
};

export const emptyDraft = (overrides: Partial<PersonDraft> = {}): PersonDraft => ({
  givenName: "",
  familyName: "",
  gender: "unknown",
  living: true,
  born: "",
  died: "",
  place: "",
  phone: "",
  askLater: false,
  under18: false,
  ...overrides,
});

export function draftFromPerson(p: Person): PersonDraft {
  return {
    givenName: p.givenName ?? "",
    familyName: p.familyName ?? "",
    gender: p.gender,
    living: !p.isDeceased,
    born: formatFuzzyDate(p.birth),
    died: formatFuzzyDate(p.death),
    place: p.place ?? "",
    phone: p.phone ?? "",
    askLater: p.phoneStatus === "requested",
    under18: false,
  };
}

export type DraftErrors = Partial<Record<"givenName" | "born" | "died" | "place" | "phone", string>>;

/** Whether the phone field applies (living adults only). */
export function needsPhone(d: PersonDraft): boolean {
  if (!d.living) return false;
  const born = parseFuzzyDate(d.born);
  return !computeIsMinor({ birth: born.ok ? born.value : null, minorOverride: d.under18, isDeceased: false });
}

/**
 * Converts a draft to the shared person payload (the same shape the wizard, the public form and
 * the database functions use), applying the spec's required-field rules.
 */
export function draftToPayload(
  d: PersonDraft,
  opts: { allowAskLater: boolean },
): { ok: true; value: PersonFieldsInput } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const born = parseFuzzyDate(d.born);
  if (!born.ok) errors.born = t(born.error);
  const died = d.living ? null : parseFuzzyDate(d.died);
  if (died && !died.ok) errors.died = t(died.error);

  let phone: string | null = null;
  if (d.living && d.phone.trim()) {
    const parsed = normalizePhone(d.phone);
    if (parsed.ok) phone = parsed.e164;
    else errors.phone = t(parsed.error);
  }

  const value: PersonFieldsInput = {
    given_name: d.givenName.trim() || undefined,
    family_name: d.familyName.trim() || undefined,
    gender: d.gender,
    is_deceased: !d.living,
    birth: born.ok && born.value.date ? born.value : null,
    death: died && died.ok && died.value.date ? died.value : null,
    minor_override: d.under18 || null,
    phone,
    phone_status: !phone && d.askLater ? "requested" : undefined,
    location: d.place.trim() ? { label: d.place.trim(), kind: d.living ? "current" : "death" } : null,
  };

  const parsed = personFieldsSchema({ allowAskLater: opts.allowAskLater }).safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = ({ given_name: "givenName", location: "place", phone: "phone", death: "died", birth: "born" } as const)[
        issue.path[0] as "given_name" | "location" | "phone" | "death" | "birth"
      ];
      if (field && !errors[field]) errors[field] = t(issue.message);
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
