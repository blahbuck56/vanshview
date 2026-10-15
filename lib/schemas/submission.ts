import { z } from "zod";
import { parentChildKinds, unionEndReasons, unionKinds } from "./enums";
import { FuzzyDateSchema } from "./fuzzy-date";
import { personFieldsSchema } from "./person";

/**
 * SubmissionPayload: the one contract shared by the in-app wizard, the public intake form,
 * server actions and commit_submission(). Temp ids reference each other within the payload;
 * existing_person_id points at a canonical person already in the tree.
 */

export const TempIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "temp_id.invalid");

const withTempId = <T extends z.ZodTypeAny>(schema: T) =>
  z.intersection(z.object({ temp_id: TempIdSchema }), schema);

export const ExistingPersonRefSchema = z.strictObject({
  temp_id: TempIdSchema,
  existing_person_id: z.guid(),
});

export const SubmittedPersonSchema = z.union([
  ExistingPersonRefSchema,
  withTempId(personFieldsSchema({ allowAskLater: true })),
]);

// The submitter is either a new person (public form: phone required, no "ask later") or,
// in the in-app wizard, the signed-in member's own existing person.
export const SubmitterSchema = z.union([
  ExistingPersonRefSchema,
  withTempId(personFieldsSchema({ allowAskLater: false })),
]);

export const SubmissionPayloadSchema = z
  .object({
    submitter: SubmitterSchema,
    persons: z.array(SubmittedPersonSchema).max(200).default([]),
    parent_child: z
      .array(
        z.object({
          parent_temp_id: TempIdSchema,
          child_temp_id: TempIdSchema,
          kind: z.enum(parentChildKinds).default("biological"),
        }),
      )
      .default([]),
    unions: z
      .array(
        z.object({
          member_temp_ids: z.tuple([TempIdSchema, TempIdSchema]),
          kind: z.enum(unionKinds).default("marriage"),
          end_reason: z.enum(unionEndReasons).optional(),
          start: FuzzyDateSchema.nullish(),
        }),
      )
      .default([]),
    media: z
      .array(
        z.object({
          temp_id: TempIdSchema,
          storage_path: z.string().min(1),
          person_temp_ids: z.array(TempIdSchema).default([]),
        }),
      )
      .default([]),
    invites: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(200),
            email: z.email().optional(),
            phone: z.string().optional(),
          })
          .refine((i) => Boolean(i.email || i.phone), { message: "invite.contact_required" }),
      )
      .default([]),
    notes: z.string().max(5_000).default(""),
  })
  .superRefine((payload, ctx) => {
    const personIds = new Set<string>();
    const all = [payload.submitter, ...payload.persons];
    all.forEach((p, i) => {
      if (personIds.has(p.temp_id)) {
        ctx.addIssue({
          code: "custom",
          path: i === 0 ? ["submitter", "temp_id"] : ["persons", i - 1, "temp_id"],
          message: "temp_id.duplicate",
        });
      }
      personIds.add(p.temp_id);
    });

    const known = (id: string) => personIds.has(id);
    const biologicalParents = new Map<string, number>();
    const edges = new Set<string>();

    payload.parent_child.forEach((e, i) => {
      if (!known(e.parent_temp_id)) ctx.addIssue({ code: "custom", path: ["parent_child", i, "parent_temp_id"], message: "temp_id.unknown" });
      if (!known(e.child_temp_id)) ctx.addIssue({ code: "custom", path: ["parent_child", i, "child_temp_id"], message: "temp_id.unknown" });
      if (e.parent_temp_id === e.child_temp_id) ctx.addIssue({ code: "custom", path: ["parent_child", i], message: "parent_child.self" });
      const key = `${e.parent_temp_id}>${e.child_temp_id}`;
      if (edges.has(key)) ctx.addIssue({ code: "custom", path: ["parent_child", i], message: "parent_child.duplicate" });
      edges.add(key);
      if (e.kind === "biological") {
        const n = (biologicalParents.get(e.child_temp_id) ?? 0) + 1;
        biologicalParents.set(e.child_temp_id, n);
        if (n > 2) ctx.addIssue({ code: "custom", path: ["parent_child", i], message: "parent_child.max_two_biological" });
      }
    });

    payload.unions.forEach((u, i) => {
      const [a, b] = u.member_temp_ids;
      if (a === b) ctx.addIssue({ code: "custom", path: ["unions", i], message: "union.same_person" });
      u.member_temp_ids.forEach((id, j) => {
        if (!known(id)) ctx.addIssue({ code: "custom", path: ["unions", i, "member_temp_ids", j], message: "temp_id.unknown" });
      });
    });

    payload.media.forEach((m, i) => {
      if (personIds.has(m.temp_id)) ctx.addIssue({ code: "custom", path: ["media", i, "temp_id"], message: "temp_id.duplicate" });
      m.person_temp_ids.forEach((id, j) => {
        if (!known(id)) ctx.addIssue({ code: "custom", path: ["media", i, "person_temp_ids", j], message: "temp_id.unknown" });
      });
    });
  });

export type SubmissionPayload = z.output<typeof SubmissionPayloadSchema>;
export type SubmissionPayloadInput = z.input<typeof SubmissionPayloadSchema>;
