import { z } from "zod";
import { isNormalised } from "@/lib/domain/dates";
import { datePrecisions, dateQualifiers } from "./enums";

export const FuzzyDateSchema = z
  .object({
    date: z.iso.date().nullable(),
    precision: z.enum(datePrecisions),
    qualifier: z.enum(dateQualifiers).default("exact"),
  })
  .refine(isNormalised, { message: "date.not_normalised" });
