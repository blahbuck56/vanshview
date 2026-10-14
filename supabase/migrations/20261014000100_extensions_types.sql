-- Extensions, enum types and small immutable helpers shared by every later migration.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Declaration order matters: roles compare viewer < editor < admin < owner.
create type public.member_role as enum ('viewer', 'editor', 'admin', 'owner');

create type public.gender as enum ('male', 'female', 'other', 'unknown');
create type public.date_precision as enum ('day', 'month', 'year', 'decade', 'unknown');
create type public.date_qualifier as enum ('exact', 'about', 'before', 'after');
create type public.name_kind as enum ('birth', 'married', 'nickname', 'alias', 'transliteration');
create type public.place_kind as enum ('birth', 'death', 'residence', 'current', 'ancestral');
create type public.link_platform as enum ('linkedin', 'instagram', 'facebook', 'x', 'website', 'other');
create type public.union_kind as enum ('marriage', 'partnership', 'unknown');
create type public.union_end_reason as enum ('divorce', 'separation', 'death');
create type public.parent_child_kind as enum ('biological', 'adoptive', 'step', 'foster', 'guardian', 'unknown');
create type public.branch_lineage as enum ('all_descendants', 'patrilineal', 'matrilineal');
create type public.invite_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type public.decision_status as enum ('pending', 'approved', 'rejected');
create type public.form_link_status as enum ('active', 'paused', 'expired');
create type public.submission_status as enum ('draft', 'pending', 'approved', 'partially_approved', 'rejected');
create type public.submission_mode as enum ('self', 'interview', 'public');
create type public.resolution_action as enum ('create', 'link_existing', 'reject');
create type public.change_op as enum ('insert', 'update', 'delete');
-- provided: phone stored. requested: skipped with "ask later". not_applicable: deceased, minor or placeholder.
create type public.phone_status as enum ('provided', 'requested', 'not_applicable');

-- Fuzzy dates are stored as (date, precision, qualifier). The date is normalised to the
-- start of its period: year 1920 -> 1920-01-01, March 1952 -> 1952-03-01, 1950s -> 1950-01-01.
create function public.fuzzy_date_is_normalised(d date, p public.date_precision)
returns boolean
language sql immutable parallel safe
set search_path = ''
as $$
  select case
    when p = 'unknown' then d is null
    when d is null then false
    when p = 'day' then true
    when p = 'month' then extract(day from d) = 1
    when p = 'year' then extract(day from d) = 1 and extract(month from d) = 1
    when p = 'decade' then extract(day from d) = 1 and extract(month from d) = 1
                        and extract(year from d)::int % 10 = 0
  end
$$;

-- Last day covered by a fuzzy date (e.g. year 1920 -> 1920-12-31). NULL when unknown.
create function public.fuzzy_date_end(d date, p public.date_precision)
returns date
language sql immutable parallel safe
set search_path = ''
as $$
  select case p
    when 'day' then d
    when 'month' then (d + interval '1 month' - interval '1 day')::date
    when 'year' then (d + interval '1 year' - interval '1 day')::date
    when 'decade' then (d + interval '10 years' - interval '1 day')::date
    else null
  end
$$;

-- Generic updated_at maintenance.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
