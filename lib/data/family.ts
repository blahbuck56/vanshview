import type { SupabaseClient } from "@supabase/supabase-js";
import type { FuzzyDate } from "@/lib/domain/dates";
import { formatLifespan } from "@/lib/domain/dates";
import type { Database } from "@/types/database";

export type DB = SupabaseClient<Database>;
type PersonRow = Database["public"]["Tables"]["persons"]["Row"];
type UnionRow = Database["public"]["Tables"]["unions"]["Row"];
export type ParentChildRow = Database["public"]["Tables"]["parent_child"]["Row"];
export type UnionMemberRow = Database["public"]["Tables"]["union_members"]["Row"];

/** A person as the UI uses them: fuzzy dates as objects, main place resolved to a label. */
export type Person = {
  id: string;
  spaceId: string;
  givenName: string | null;
  familyName: string | null;
  gender: PersonRow["gender"];
  birth: FuzzyDate | null;
  death: FuzzyDate | null;
  isDeceased: boolean;
  isPlaceholder: boolean;
  isMinor: boolean;
  phone: string | null;
  phoneStatus: PersonRow["phone_status"];
  email: string | null;
  biography: string | null;
  place: string | null;
};

export type Union = {
  id: string;
  kind: UnionRow["kind"];
  start: FuzzyDate | null;
  endReason: UnionRow["end_reason"];
  memberIds: string[];
};

const fuzzy = (date: string | null, precision: PersonRow["birth_precision"], qualifier: PersonRow["birth_qualifier"]) =>
  date && precision !== "unknown" ? { date, precision, qualifier } : null;

export function toPerson(r: PersonRow, place: string | null = null): Person {
  return {
    id: r.id,
    spaceId: r.space_id,
    givenName: r.given_name,
    familyName: r.family_name,
    gender: r.gender,
    birth: fuzzy(r.birth_date, r.birth_precision, r.birth_qualifier),
    death: fuzzy(r.death_date, r.death_precision, r.death_qualifier),
    isDeceased: r.is_deceased,
    isPlaceholder: r.is_placeholder,
    isMinor: r.is_minor,
    phone: r.phone,
    phoneStatus: r.phone_status,
    email: r.email,
    biography: r.biography,
    place,
  };
}

export function displayName(p: Pick<Person, "givenName" | "familyName" | "isPlaceholder" | "gender">): string {
  if (p.isPlaceholder) {
    return p.gender === "male" ? "Unknown father" : p.gender === "female" ? "Unknown mother" : "Unknown parent";
  }
  return [p.givenName, p.familyName].filter(Boolean).join(" ");
}

export function firstName(p: Pick<Person, "givenName" | "familyName" | "isPlaceholder" | "gender">): string {
  return p.isPlaceholder ? displayName(p) : (p.givenName ?? displayName(p));
}

/** "~1932–2009 · Amritsar", "b. 1991 · Pune". */
export function subtitle(p: Person): string {
  return [formatLifespan(p.birth, p.death, p.isDeceased), p.place].filter(Boolean).join(" · ");
}

/** Main place label per person (the first place recorded). */
async function placesFor(db: DB, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await db
    .from("person_places")
    .select("person_id, created_at, places(label)")
    .in("person_id", ids)
    .order("created_at");
  if (error) throw error;
  for (const row of data ?? []) {
    const label = (row.places as { label: string } | null)?.label;
    if (label && !out.has(row.person_id)) out.set(row.person_id, label);
  }
  return out;
}

export async function loadPeople(db: DB, ids: string[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const [{ data, error }, places] = await Promise.all([
    db.from("persons").select("*").in("id", unique).is("deleted_at", null),
    placesFor(db, unique),
  ]);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.id, toPerson(r, places.get(r.id) ?? null)]));
}

export type Neighborhood = {
  persons: Person[];
  parentChild: ParentChildRow[];
  unions: Union[];
};

/** Everything the tree needs around one person, in one database call plus place labels. */
export async function loadNeighborhood(db: DB, focusId: string, up: number, down: number): Promise<Neighborhood> {
  const { data, error } = await db.rpc("neighborhood", { p_focus_id: focusId, p_up: up, p_down: down });
  if (error) throw error;
  const n = data as unknown as {
    persons: PersonRow[];
    parent_child: ParentChildRow[];
    unions: UnionRow[];
    union_members: UnionMemberRow[];
  };
  const places = await placesFor(
    db,
    n.persons.map((p) => p.id),
  );
  return {
    persons: n.persons.map((p) => toPerson(p, places.get(p.id) ?? null)),
    parentChild: n.parent_child,
    unions: n.unions.map((u) => ({
      id: u.id,
      kind: u.kind,
      start: fuzzy(u.start_date, u.start_precision, u.start_qualifier),
      endReason: u.end_reason,
      memberIds: n.union_members.filter((m) => m.union_id === u.id).map((m) => m.person_id),
    })),
  };
}

export type Relatives = {
  parents: { person: Person; kind: ParentChildRow["kind"] }[];
  partners: { person: Person; union: Union }[];
  children: { person: Person; kind: ParentChildRow["kind"]; unionId: string | null }[];
  siblings: { person: Person; kind: "full" | "half" | "step" }[];
};

export async function loadRelatives(db: DB, personId: string): Promise<Relatives> {
  const [asChild, asParent, memberships, sibs] = await Promise.all([
    db.from("parent_child").select("*").eq("child_id", personId),
    db.from("parent_child").select("*").eq("parent_id", personId),
    db.from("union_members").select("union_id").eq("person_id", personId),
    db.rpc("siblings", { p_person_id: personId }),
  ]);
  for (const r of [asChild, asParent, memberships, sibs]) if (r.error) throw r.error;

  const unionIds = (memberships.data ?? []).map((m) => m.union_id);
  const [unionRows, unionMembers] = unionIds.length
    ? await Promise.all([
        db.from("unions").select("*").in("id", unionIds).is("deleted_at", null),
        db.from("union_members").select("*").in("union_id", unionIds),
      ])
    : [{ data: [] as UnionRow[], error: null }, { data: [] as UnionMemberRow[], error: null }];
  if (unionRows.error) throw unionRows.error;
  if (unionMembers.error) throw unionMembers.error;

  const ids = [
    ...(asChild.data ?? []).map((e) => e.parent_id),
    ...(asParent.data ?? []).map((e) => e.child_id),
    ...(unionMembers.data ?? []).map((m) => m.person_id).filter((id) => id !== personId),
    ...(sibs.data ?? []).map((s) => s.person_id),
  ];
  const people = await loadPeople(db, ids);
  const has = <T extends { person: Person | undefined }>(x: T): x is T & { person: Person } => Boolean(x.person);

  const unions: Union[] = (unionRows.data ?? []).map((u) => ({
    id: u.id,
    kind: u.kind,
    start: fuzzy(u.start_date, u.start_precision, u.start_qualifier),
    endReason: u.end_reason,
    memberIds: (unionMembers.data ?? []).filter((m) => m.union_id === u.id).map((m) => m.person_id),
  }));

  return {
    parents: (asChild.data ?? []).map((e) => ({ person: people.get(e.parent_id), kind: e.kind })).filter(has),
    partners: unions
      .map((u) => ({ person: people.get(u.memberIds.find((id) => id !== personId) ?? ""), union: u }))
      .filter(has),
    children: (asParent.data ?? [])
      .map((e) => ({ person: people.get(e.child_id), kind: e.kind, unionId: e.union_id }))
      .filter(has)
      .sort((a, b) => (a.person.birth?.date ?? "9999").localeCompare(b.person.birth?.date ?? "9999")),
    siblings: (sibs.data ?? [])
      .map((s) => ({ person: people.get(s.person_id), kind: s.kind as "full" | "half" | "step" }))
      .filter(has)
      .sort((a, b) => (a.person.birth?.date ?? "9999").localeCompare(b.person.birth?.date ?? "9999")),
  };
}

export async function searchPeople(db: DB, spaceId: string, q: string, limit = 8): Promise<Person[]> {
  const term = q.trim();
  if (!term) return [];
  const parts = term.split(/\s+/);
  let query = db
    .from("persons")
    .select("*")
    .eq("space_id", spaceId)
    .is("deleted_at", null)
    .eq("is_placeholder", false)
    .limit(limit);
  for (const part of parts) {
    const safe = part.replace(/[%_,()]/g, "");
    if (safe) query = query.or(`given_name.ilike.%${safe}%,family_name.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  const places = await placesFor(
    db,
    (data ?? []).map((r) => r.id),
  );
  return (data ?? []).map((r) => toPerson(r, places.get(r.id) ?? null));
}

export type Candidate = { person: Person; score: number; reasons: string[] };

/** "Already in the family" matches while typing a name (same function the review queue uses). */
export async function findCandidates(
  db: DB,
  spaceId: string,
  name: string,
  opts: { phone?: string | null; place?: string | null; birthYear?: number | null } = {},
): Promise<Candidate[]> {
  const words = name.trim().split(/\s+/);
  if (!words[0]) return [];
  const given = words.length > 1 ? words.slice(0, -1).join(" ") : words[0];
  const family = words.length > 1 ? words.at(-1)! : undefined;
  const { data, error } = await db.rpc("dedup_candidates", {
    p_space_id: spaceId,
    p_given: given,
    p_family: family,
    p_phone: opts.phone ?? undefined,
    p_location: opts.place ?? undefined,
    p_birth_year: opts.birthYear ?? undefined,
    p_limit: 5,
  });
  if (error) throw error;
  const people = await loadPeople(
    db,
    (data ?? []).map((c) => c.person_id),
  );
  return (data ?? [])
    .map((c) => ({ person: people.get(c.person_id)!, score: Number(c.score), reasons: c.reasons }))
    .filter((c) => c.person);
}

export type Membership = {
  spaceId: string;
  spaceName: string;
  role: Database["public"]["Enums"]["member_role"];
  personId: string | null;
};

export async function myMemberships(db: DB, userId: string): Promise<Membership[]> {
  const { data, error } = await db
    .from("space_members")
    .select("space_id, role, person_id, spaces(name)")
    .eq("user_id", userId)
    .order("joined_at");
  if (error) throw error;
  return (data ?? []).map((m) => ({
    spaceId: m.space_id,
    spaceName: (m.spaces as { name: string } | null)?.name ?? "Family",
    role: m.role,
    personId: m.person_id,
  }));
}

/**
 * Messages raised by our database functions are written for people and shown as they are.
 * Everything else (driver, network, auth) is translated or replaced with a generic message.
 */
export function errorMessage(e: unknown): string {
  const message = e && typeof e === "object" && "message" in e && typeof e.message === "string" ? e.message : "";
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied/i.test(message)) return "You don't have permission to do that in this family.";
  if (/invalid input syntax for type uuid/i.test(message)) return "This link doesn't look right. Check it and try again.";
  if (/JWT|refresh token|not authenticated/i.test(message)) return "Your session has ended. Please sign in again.";
  if (/Failed to fetch|NetworkError|network/i.test(message)) return "Can't reach Vanshview. Check your connection and try again.";
  if (/duplicate key|violates|syntax error|relation .* does not exist|function .* does not exist/i.test(message)) {
    return "Something went wrong saving that. Please try again.";
  }
  return message;
}
