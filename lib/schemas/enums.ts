import { Constants } from "@/types/database";

// Single source of truth: enum values come from the generated database types.
const E = Constants.public.Enums;

export const genders = E.gender;
export const datePrecisions = E.date_precision;
export const dateQualifiers = E.date_qualifier;
export const placeKinds = E.place_kind;
export const nameKinds = E.name_kind;
export const linkPlatforms = E.link_platform;
export const unionKinds = E.union_kind;
export const unionEndReasons = E.union_end_reason;
export const parentChildKinds = E.parent_child_kind;
export const memberRoles = E.member_role;
