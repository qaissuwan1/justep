-- ============================================================================
-- JUStep - reconcile manually-created profile and flashcard-review schema (023)
--
-- This forward migration normalizes already-running environments while the
-- surgical repairs in 010/011/013/016 make empty-database replay reproducible.
-- It does not touch the Supabase migration ledger or remove learning history.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. Public profile fields and safe public view
-- ============================================================================

alter table public.profiles
  add column if not exists username text,
  add column if not exists avatar_url text;

-- Build the canonical index before removing the legacy equivalent, so
-- case-insensitive uniqueness is never left unenforced.
create unique index if not exists idx_profiles_username_lower
  on public.profiles (lower(username))
  where username is not null;

drop index if exists public.profiles_username_lower_unique;

create or replace view public.public_profiles as
  select id, full_name, username, avatar_url
  from public.profiles;

alter view public.public_profiles set (security_invoker = false);
alter view public.public_profiles owner to postgres;

revoke all on public.public_profiles from public;
revoke all on public.public_profiles from anon;
revoke all on public.public_profiles from authenticated;
grant select on public.public_profiles to authenticated;

-- ============================================================================
-- 2. Canonical append-only flashcard review history
-- ============================================================================

create table if not exists public.flashcard_reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  flashcard_id  uuid,
  rating        text not null,
  interval_days integer,
  ease_factor   numeric,
  next_review   timestamptz,
  reviewed_at   timestamptz not null default now(),
  constraint flashcard_reviews_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade,
  constraint flashcard_reviews_flashcard_id_fkey
    foreign key (flashcard_id) references public.flashcards (id) on delete set null,
  constraint flashcard_reviews_rating_check
    check (rating in ('again', 'hard', 'good', 'easy'))
);

-- Add only verified canonical columns. No created_at column is introduced.
alter table public.flashcard_reviews
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists flashcard_id uuid,
  add column if not exists rating text,
  add column if not exists interval_days integer,
  add column if not exists ease_factor numeric,
  add column if not exists next_review timestamptz,
  add column if not exists reviewed_at timestamptz;

-- Migration 017 already backfills reviewed_at from legacy created_at when that
-- trustworthy event timestamp exists. next_review is a future scheduling value,
-- not the review event time, so it must never be used as a substitute. The
-- verified remote data has no NULL reviewed_at values; fail clearly instead of
-- fabricating history if another legacy environment still contains any.
do $migration$
begin
  if exists (
    select 1
    from public.flashcard_reviews
    where reviewed_at is null
  ) then
    raise exception using
      errcode = '23502',
      message = 'flashcard_reviews.reviewed_at contains legacy NULL values',
      detail = 'Migration 017 could not recover a trustworthy review event timestamp.',
      hint = 'Backfill only from a verified historical event timestamp before retrying.';
  end if;
end
$migration$;

-- UUID defaults populate newly-added id values, but retain this explicit repair
-- for environments where the column existed without its canonical default.
update public.flashcard_reviews
set id = gen_random_uuid()
where id is null;

alter table public.flashcard_reviews
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column user_id set not null,
  alter column rating set not null,
  alter column reviewed_at set default now(),
  alter column reviewed_at set not null,
  alter column flashcard_id drop not null;

-- Fail rather than silently choosing among duplicate IDs in a drifted
-- environment. The verified remote table already has a clean primary key.
do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.flashcard_reviews'::regclass
      and contype = 'p'
  ) then
    alter table public.flashcard_reviews
      add constraint flashcard_reviews_pkey primary key (id);
  end if;
end
$migration$;

-- Recreate verified constraints under canonical names. NOT VALID separates
-- creation from validation and produces a clear failure without deleting or
-- rewriting any review event.
alter table public.flashcard_reviews
  drop constraint if exists flashcard_reviews_user_id_fkey;
alter table public.flashcard_reviews
  add constraint flashcard_reviews_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade
  not valid;
alter table public.flashcard_reviews
  validate constraint flashcard_reviews_user_id_fkey;

alter table public.flashcard_reviews
  drop constraint if exists flashcard_reviews_flashcard_id_fkey;
alter table public.flashcard_reviews
  add constraint flashcard_reviews_flashcard_id_fkey
  foreign key (flashcard_id) references public.flashcards (id) on delete set null
  not valid;
alter table public.flashcard_reviews
  validate constraint flashcard_reviews_flashcard_id_fkey;

alter table public.flashcard_reviews
  drop constraint if exists flashcard_reviews_rating_check;
alter table public.flashcard_reviews
  add constraint flashcard_reviews_rating_check
  check (rating in ('again', 'hard', 'good', 'easy'))
  not valid;
alter table public.flashcard_reviews
  validate constraint flashcard_reviews_rating_check;

create index if not exists idx_fc_reviews_user
  on public.flashcard_reviews (user_id, flashcard_id, reviewed_at desc);

alter table public.flashcard_reviews enable row level security;

-- Normalize to explicit append-only policies. Students can read their own
-- history and append their own events, but cannot alter or erase history.
do $migration$
declare
  v_policy pg_catalog.record;
begin
  for v_policy in
    select pol.polname
    from pg_catalog.pg_policy as pol
    where pol.polrelid = 'public.flashcard_reviews'::regclass
  loop
    execute pg_catalog.format(
      'drop policy %I on public.flashcard_reviews',
      v_policy.polname
    );
  end loop;
end
$migration$;

create policy "flashcard_reviews_select_own"
  on public.flashcard_reviews
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "flashcard_reviews_insert_own"
  on public.flashcard_reviews
  for insert
  to authenticated
  with check (auth.uid() = user_id);

revoke all on public.flashcard_reviews from public;
revoke all on public.flashcard_reviews from anon;
revoke all on public.flashcard_reviews from authenticated;
grant select, insert
  on public.flashcard_reviews to authenticated;

-- ============================================================================
-- 3. Hardened server-side leaderboard
-- ============================================================================

create or replace function public.get_leaderboard()
returns table (
  id uuid,
  full_name text,
  username text,
  avatar_url text,
  total bigint,
  correct bigint,
  accuracy integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  with latest_attempt as (
    select distinct on (up.user_id, up.question_id)
      up.user_id,
      up.question_id,
      up.is_correct
    from public.user_progress as up
    order by
      up.user_id,
      up.question_id,
      up.answered_at desc,
      up.id desc
  ),
  totals as (
    select
      la.user_id,
      count(*) filter (where la.is_correct is not null)::bigint as total,
      count(*) filter (where la.is_correct = true)::bigint as correct
    from latest_attempt as la
    group by la.user_id
  )
  select
    p.id,
    p.full_name,
    p.username,
    p.avatar_url,
    coalesce(t.total, 0::bigint) as total,
    coalesce(t.correct, 0::bigint) as correct,
    case
      when t.total = 0 then 0
      else round((t.correct::numeric / t.total::numeric) * 100)::integer
    end as accuracy
  from totals as t
  join public.profiles as p on p.id = t.user_id
  where t.total > 0
  order by
    t.total desc,
    accuracy desc
  limit 100;
$function$;

alter function public.get_leaderboard() owner to postgres;

revoke all on function public.get_leaderboard() from public;
revoke all on function public.get_leaderboard() from anon;
revoke all on function public.get_leaderboard() from authenticated;
grant execute on function public.get_leaderboard() to authenticated;
