import { z } from "zod";
import { fuzzyDateEnd } from "@/lib/domain/dates";
import { computeIsMinor } from "@/lib/domain/minor";
import { E164_PATTERN } from "@/lib/domain/phone";
import { FuzzyDateSchema } from "./fuzzy-date";
import { genders, linkPlatforms, nameKinds, placeKinds } from "./enums";

// Messages are i18n keys, not copy.

export const LocationSchema = z.object({
  label: z.string().trim().min(1, "location.required").max(200),
  kind: z.enum(placeKinds),
  place_id: z.guid().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const OtherNameSchema = z
  .object({
    kind: z.enum(nameKinds),
    given: z.string().trim().max(100).optional(),
    family: z.string().trim().max(100).optional(),
    script: z
      .string()
      .regex(/^[A-Z][a-z]{3}$/)
      .optional(),
  })
  .refine((n) => Boolean(n.given || n.family), { message: "name.empty" });

export const LinkSchema = z.object({
  platform: z.enum(linkPlatforms),
  url: z.url({ protocol: /^https?$/ }),
});

const basePersonFields = z.object({
  given_name: z.string().trim().max(100).optional(),
  family_name: z.string().trim().max(100).nullish(),
  // Family name at birth when it differs (e.g. before marriage); null clears it.
  birth_family_name: z.string().trim().max(100).nullish(),
  gender: z.enum(genders).default("unknown"),
  birth: FuzzyDateSchema.nullish(),
  death: FuzzyDateSchema.nullish(),
  is_deceased: z.boolean().default(false),
  is_placeholder: z.boolean().default(false),
  minor_override: z.boolean().nullish(),
  phone: z.string().regex(E164_PATTERN, "phone.invalid").nullish(),
  // "requested" = skipped with "ask later". Never allowed for the submitter or a claimed profile.
  phone_status: z.enum(["provided", "requested"]).optional(),
  email: z.email("email.invalid").nullish(),
  location: LocationSchema.nullish(),
  biography: z.string().max(10_000).optional(),
  other_names: z.array(OtherNameSchema).max(20).optional(),
  links: z.array(LinkSchema).max(20).optional(),
});

export type PersonFieldsInput = z.input<typeof basePersonFields>;

/**
 * Spec 3a required fields, shared by the wizard, the public form, server actions and the
 * commit function's payload contract.
 *   living adult: name, location, phone (or "ask later" when allowed)
 *   living minor: name, location
 *   deceased:     name, location; phone is never collected (cleared)
 *   placeholder:  nothing
 */
export function personFieldsSchema(opts: { allowAskLater: boolean; today?: Date } = { allowAskLater: true }) {
  return basePersonFields
    .superRefine((p, ctx) => {
      if (p.is_placeholder) return;

      if (!p.given_name) ctx.addIssue({ code: "custom", path: ["given_name"], message: "name.required" });
      if (!p.location) ctx.addIssue({ code: "custom", path: ["location"], message: "location.required" });

      if (p.death?.date && !p.is_deceased) {
        ctx.addIssue({ code: "custom", path: ["death"], message: "death.requires_deceased" });
      }
      if (
        p.birth?.date && p.death?.date &&
        p.birth.qualifier === "exact" && p.death.qualifier === "exact" &&
        fuzzyDateEnd(p.death)! < p.birth.date
      ) {
        ctx.addIssue({ code: "custom", path: ["death"], message: "death.before_birth" });
      }

      const minor = computeIsMinor(
        { birth: p.birth, minorOverride: p.minor_override, isDeceased: p.is_deceased },
        opts.today,
      );
      if (!p.is_deceased && !minor && !p.phone) {
        if (!opts.allowAskLater) {
          ctx.addIssue({ code: "custom", path: ["phone"], message: "phone.required_for_self" });
        } else if (p.phone_status !== "requested") {
          ctx.addIssue({ code: "custom", path: ["phone"], message: "phone.required" });
        }
      }
    })
    .transform((p) => (p.is_deceased ? { ...p, phone: null, phone_status: undefined } : p));
}

export const PersonFieldsSchema = personFieldsSchema({ allowAskLater: true });
export type PersonFields = z.output<typeof PersonFieldsSchema>;
