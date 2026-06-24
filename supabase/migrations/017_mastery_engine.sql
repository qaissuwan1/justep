-- ============================================================================
-- JUstep — Mastery Engine (017)
--
-- Pure-SQL analytics layer. Computes a 0-100 Mastery score per Topic and rolls
-- it up to Subject and System, plus an At-Risk list and diagnostic flags.
--
-- Model:  Mastery = K x rho
--   K   = w_A*A + w_R*R + w_C*C + w_Q*Q        (weights from mastery_config)
--   rho = exp(-delta_t / S),  S = min(cap, S0 * (1 + beta * n_eff))
--
-- HARD RULES:
--   * AS-OF: every function takes an explicit `as_of timestamptz`. now() is
--     NEVER called inside any function body — decay is a pure function of as_of.
--   * VERSIONED CONFIG: all weights + constants live in mastery_config (v1
--     seeded active below). Functions read the row WHERE is_active = true.
--   * RETENTION FROM RATINGS ONLY: R reads flashcard_reviews.rating, never
--     ease_factor / interval_days.
--   * NULL vs ZERO: a topic with zero activity returns NULL (not 0).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- CREATE INDEX IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING.
--
-- SECURITY: these are SECURITY DEFINER and accept an explicit p_user_id, so they
-- bypass RLS. EXECUTE is restricted to `authenticated` (REVOKE FROM PUBLIC below).
-- Every PUBLIC function additionally enforces an authorization guard at the top:
--     if p_user_id <> auth.uid() and not public.is_admin() then raise exception ...
-- => a student may query only their OWN p_user_id; an admin (public.is_admin(),
-- migration 003) may query anyone. The internal helper mastery_topic_full has no
-- guard and is not granted to authenticated — it is only called by the guarded
-- functions above (which already validated the caller).
-- ============================================================================

create extension if not exists pgcrypto;

-- ===========================================================================
-- 0. Ensure flashcard_reviews has a reliable as-of timestamp.
--    The table was created out-of-band (no migration defines it); the app
--    insert relies on a default timestamp column. This guard is idempotent and
--    a no-op if `reviewed_at` already exists. If the real timestamp column is
--    named `created_at`, it is backfilled into `reviewed_at`.
-- ===========================================================================
alter table public.flashcard_reviews add column if not exists reviewed_at timestamptz;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'flashcard_reviews'
      and column_name = 'created_at'
  ) then
    execute 'update public.flashcard_reviews set reviewed_at = created_at where reviewed_at is null';
  end if;
end $$;

alter table public.flashcard_reviews alter column reviewed_at set default now();

-- ===========================================================================
-- 1. mastery_config — versioned weights + constants. Exactly one active row.
-- ===========================================================================
create table if not exists public.mastery_config (
  version    int primary key,
  weights    jsonb not null,
  constants  jsonb not null,
  is_active  boolean default false,
  created_at timestamptz default now()
);

-- only one row may be is_active = true at a time
create unique index if not exists mastery_config_one_active
  on public.mastery_config (is_active) where is_active = true;

insert into public.mastery_config (version, weights, constants, is_active)
values (
  1,
  '{"w_A": 0.40, "w_R": 0.35, "w_C": 0.15, "w_Q": 0.10}'::jsonb,
  '{"shrinkage_alpha": 3, "shrinkage_prior": 0.5, "retention_S0": 3, "retention_beta": 2.5,
    "stability_cap": 21, "spacing_floor": 0.6, "spacing_span": 7, "distinct_days_target": 4}'::jsonb,
  true
)
on conflict (version) do nothing;

-- ===========================================================================
-- 2. mastery_band(score) -> text
-- ===========================================================================
create or replace function public.mastery_band(score numeric)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when score is null then 'Not Started'
    when score <= 40   then 'Learning'
    when score <= 60   then 'Reviewing'
    when score <= 80   then 'Proficient'
    else 'Mastered'
  end;
$$;

-- ===========================================================================
-- 3a. Internal helper: full per-topic breakdown (mastery, K, rho, components,
--     volume). mastery_topic / at_risk_topics / topic_flags all build on this
--     so the heavy logic lives in one place. Returns all-NULL (mastery NULL)
--     when the user has no activity on the topic.
-- ===========================================================================
create or replace function public.mastery_topic_full(
  p_user_id  uuid,
  p_topic_id uuid,
  as_of      timestamptz
)
returns table (
  mastery numeric,
  k       numeric,
  rho     numeric,
  comp_a  numeric,
  comp_r  numeric,
  comp_c  numeric,
  comp_q  numeric,
  volume  int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w jsonb; c jsonb;
  wA numeric; wR numeric; wC numeric; wQ numeric;
  alpha numeric; prior numeric; s0 numeric; beta numeric; scap numeric;
  sfloor numeric; sspan numeric; ddtarget numeric;
  vA numeric; vR numeric; vC numeric; vQ numeric; vK numeric; vRho numeric;
  dd int; span int;
  last_activity timestamptz; n_eff int; delta_t numeric; vS numeric;
  has_q boolean; has_f boolean;
  vVol int;
begin
  select weights, constants into w, c
  from public.mastery_config where is_active = true limit 1;

  wA := (w->>'w_A')::numeric; wR := (w->>'w_R')::numeric;
  wC := (w->>'w_C')::numeric; wQ := (w->>'w_Q')::numeric;
  alpha    := (c->>'shrinkage_alpha')::numeric;
  prior    := (c->>'shrinkage_prior')::numeric;
  s0       := (c->>'retention_S0')::numeric;
  beta     := (c->>'retention_beta')::numeric;
  scap     := (c->>'stability_cap')::numeric;
  sfloor   := (c->>'spacing_floor')::numeric;
  sspan    := (c->>'spacing_span')::numeric;
  ddtarget := (c->>'distinct_days_target')::numeric;

  -- active content volume for this topic
  select (select count(*) from public.questions  where topic_id = p_topic_id and deleted_at is null)
       + (select count(*) from public.flashcards where topic_id = p_topic_id and deleted_at is null)
  into vVol;

  -- any activity at all?
  select exists (
    select 1 from public.user_progress up
    join public.questions q on q.id = up.question_id
    where up.user_id = p_user_id and q.topic_id = p_topic_id and up.answered_at <= as_of
  ) into has_q;
  select exists (
    select 1 from public.flashcard_reviews fr
    join public.flashcards f on f.id = fr.flashcard_id
    where fr.user_id = p_user_id and f.topic_id = p_topic_id and fr.reviewed_at <= as_of
  ) into has_f;

  if not has_q and not has_f then
    return query select null::numeric, null::numeric, null::numeric,
                        null::numeric, null::numeric, null::numeric, null::numeric, vVol;
    return;
  end if;

  -- ---- A: Accuracy with Bayesian shrinkage (latest attempt per question) ----
  select (coalesce(sum(is_c), 0) + alpha * prior) / (count(*) + alpha) * 100
  into vA
  from (
    select distinct on (up.question_id) (up.is_correct)::int as is_c
    from public.user_progress up
    join public.questions q on q.id = up.question_id
    where up.user_id = p_user_id and q.topic_id = p_topic_id
      and up.answered_at <= as_of and up.is_correct is not null
    order by up.question_id, up.answered_at desc
  ) s;

  -- ---- R: Retention from observed ratings only (recency-weighted x maturity) ----
  select coalesce(sum(quality * rw) / nullif(sum(rw), 0), 0)
         * least(1.0, count(distinct rdate)::numeric / ddtarget)
         * 100
  into vR
  from (
    select
      case fr.rating
        when 'again' then 0.0 when 'hard' then 0.4
        when 'good'  then 0.8 when 'easy' then 1.0 else 0.0 end as quality,
      exp(- extract(epoch from (as_of - fr.reviewed_at)) / 86400.0 / 7.0) as rw,
      (fr.reviewed_at)::date as rdate
    from public.flashcard_reviews fr
    join public.flashcards f on f.id = fr.flashcard_id
    where fr.user_id = p_user_id and f.topic_id = p_topic_id
      and fr.reviewed_at <= as_of and f.deleted_at is null
  ) r;

  -- ---- C: Consistency (distinct practice days x spacing) ----
  select count(distinct (up.answered_at)::date),
         coalesce(max((up.answered_at)::date) - min((up.answered_at)::date), 0)
  into dd, span
  from public.user_progress up
  join public.questions q on q.id = up.question_id
  where up.user_id = p_user_id and q.topic_id = p_topic_id and up.answered_at <= as_of;

  vC := least(1.0, dd::numeric / ddtarget)
        * (sfloor + (1 - sfloor) * least(1.0, span::numeric / sspan))
        * 100;

  -- ---- Q: Quality (relative per-question median across ALL users) ----
  with med as (
    select up.question_id,
           percentile_cont(0.5) within group (order by up.time_spent_seconds) as m
    from public.user_progress up
    join public.questions q on q.id = up.question_id
    where q.topic_id = p_topic_id and up.time_spent_seconds is not null and up.answered_at <= as_of
    group by up.question_id
  ),
  latest as (
    select distinct on (up.question_id) up.question_id, up.is_correct, up.time_spent_seconds
    from public.user_progress up
    join public.questions q on q.id = up.question_id
    where up.user_id = p_user_id and q.topic_id = p_topic_id
      and up.answered_at <= as_of and up.is_correct is not null
    order by up.question_id, up.answered_at desc
  )
  select coalesce(avg(
    case
      when l.time_spent_seconds < m.m and l.is_correct       then 1.0
      when l.is_correct                                      then 0.7
      when l.time_spent_seconds < m.m and not l.is_correct   then 0.0
      else 0.3
    end), 0) * 100
  into vQ
  from latest l
  left join med m on m.question_id = l.question_id;

  -- ---- rho: forgetting curve since last activity ----
  last_activity := greatest(
    (select max(up.answered_at) from public.user_progress up
       join public.questions q on q.id = up.question_id
       where up.user_id = p_user_id and q.topic_id = p_topic_id and up.answered_at <= as_of),
    (select max(fr.reviewed_at) from public.flashcard_reviews fr
       join public.flashcards f on f.id = fr.flashcard_id
       where fr.user_id = p_user_id and f.topic_id = p_topic_id and fr.reviewed_at <= as_of)
  );

  select count(distinct d) into n_eff from (
    select (up.answered_at)::date as d
    from public.user_progress up
    join public.questions q on q.id = up.question_id
    where up.user_id = p_user_id and q.topic_id = p_topic_id and up.answered_at <= as_of
    union
    select (fr.reviewed_at)::date
    from public.flashcard_reviews fr
    join public.flashcards f on f.id = fr.flashcard_id
    where fr.user_id = p_user_id and f.topic_id = p_topic_id and fr.reviewed_at <= as_of
  ) days;

  delta_t := extract(epoch from (as_of - last_activity)) / 86400.0;
  vS      := least(scap, s0 * (1 + beta * n_eff));
  vRho    := exp(- delta_t / vS);

  -- ---- Final ----
  vK := wA * vA + wR * vR + wC * vC + wQ * vQ;

  return query select
    round((vK * vRho)::numeric, 2),
    round(vK::numeric, 4),
    round(vRho::numeric, 6),
    round(vA::numeric, 2),
    round(vR::numeric, 2),
    round(vC::numeric, 2),
    round(vQ::numeric, 2),
    vVol;
end $$;

-- ===========================================================================
-- 3b. mastery_topic — public scalar wrapper. NULL when no activity.
-- ===========================================================================
create or replace function public.mastery_topic(
  p_user_id  uuid,
  p_topic_id uuid,
  as_of      timestamptz
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'not authorized to view another user''s mastery data';
  end if;
  return (select mastery from public.mastery_topic_full(p_user_id, p_topic_id, as_of));
end $$;

-- ===========================================================================
-- 4. mastery_subject — volume-weighted roll-up across topics.
--    NULL topics counted as 0; NULL overall when no active content.
-- ===========================================================================
create or replace function public.mastery_subject(
  p_user_id    uuid,
  p_subject_id uuid,
  as_of        timestamptz
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'not authorized to view another user''s mastery data';
  end if;
  return (
    select round(sum(coalesce(m.mastery, 0) * v.volume)::numeric / nullif(sum(v.volume), 0), 2)
    from public.topics t
    cross join lateral (select public.mastery_topic(p_user_id, t.id, as_of) as mastery) m
    cross join lateral (
      select ((select count(*) from public.questions  where topic_id = t.id and deleted_at is null)
            + (select count(*) from public.flashcards where topic_id = t.id and deleted_at is null))::int as volume
    ) v
    where t.subject_id = p_subject_id
  );
end $$;

-- ===========================================================================
-- 5. mastery_system — volume-weighted roll-up across subjects.
-- ===========================================================================
create or replace function public.mastery_system(
  p_user_id   uuid,
  p_system_id uuid,
  as_of       timestamptz
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'not authorized to view another user''s mastery data';
  end if;
  return (
    select round(sum(coalesce(ms.mastery, 0) * v.volume)::numeric / nullif(sum(v.volume), 0), 2)
    from public.subjects s
    cross join lateral (select public.mastery_subject(p_user_id, s.id, as_of) as mastery) ms
    cross join lateral (
      select (
          (select count(*) from public.questions  q join public.topics t on t.id = q.topic_id
             where t.subject_id = s.id and q.deleted_at is null)
        + (select count(*) from public.flashcards f join public.topics t on t.id = f.topic_id
             where t.subject_id = s.id and f.deleted_at is null)
      )::int as volume
    ) v
    where s.system_id = p_system_id
  );
end $$;

-- ===========================================================================
-- 6. at_risk_topics — topics that were strong (K>=50) but are fading (rho<=0.6).
-- ===========================================================================
create or replace function public.at_risk_topics(
  p_user_id uuid,
  as_of     timestamptz
)
returns table (topic_id uuid, topic_name text, k numeric, rho numeric, severity numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'not authorized to view another user''s mastery data';
  end if;
  return query
  select t.id, t.name, f.k, f.rho,
         round((f.k * (1 - f.rho) * f.volume)::numeric, 2) as severity
  from public.topics t
  cross join lateral public.mastery_topic_full(p_user_id, t.id, as_of) f
  where f.mastery is not null and f.k >= 50 and f.rho <= 0.6
  order by round((f.k * (1 - f.rho) * f.volume)::numeric, 2) desc;
end $$;

-- ===========================================================================
-- 7. topic_flags — misconception / warning (fast+wrong repeats) + recognition_gap.
-- ===========================================================================
create or replace function public.topic_flags(
  p_user_id uuid,
  as_of     timestamptz
)
returns table (topic_id uuid, question_id uuid, flag_type text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'not authorized to view another user''s mastery data';
  end if;
  return query
  with med as (
    select question_id,
           percentile_cont(0.5) within group (order by time_spent_seconds) as m
    from public.user_progress
    where time_spent_seconds is not null and answered_at <= as_of
    group by question_id
  ),
  fw as (
    select up.question_id, q.topic_id,
           count(*) filter (
             where up.is_correct = false
               and up.time_spent_seconds is not null
               and m.m is not null
               and up.time_spent_seconds < m.m
           ) as n
    from public.user_progress up
    join public.questions q on q.id = up.question_id
    left join med m on m.question_id = up.question_id
    where up.user_id = p_user_id and up.answered_at <= as_of and q.topic_id is not null
    group by up.question_id, q.topic_id
  ),
  flag_q as (
    select topic_id, question_id,
           case when n >= 3 then 'misconception' when n = 2 then 'warning' end as flag_type
    from fw
    where n >= 2
  ),
  flag_r as (
    select t.id as topic_id, null::uuid as question_id, 'recognition_gap' as flag_type
    from public.topics t
    cross join lateral public.mastery_topic_full(p_user_id, t.id, as_of) f
    where f.comp_r >= 65 and f.comp_a <= 40
  )
  select topic_id, question_id, flag_type
  from (select * from flag_q union all select * from flag_r) z
  order by case flag_type
             when 'misconception'   then 1
             when 'warning'         then 2
             else 3
           end;
end $$;

-- ===========================================================================
-- 8. Privileges — restrict to authenticated (functions are SECURITY DEFINER).
-- ===========================================================================
revoke execute on function public.mastery_band(numeric)                       from public;
revoke execute on function public.mastery_topic_full(uuid, uuid, timestamptz) from public;
revoke execute on function public.mastery_topic(uuid, uuid, timestamptz)      from public;
revoke execute on function public.mastery_subject(uuid, uuid, timestamptz)    from public;
revoke execute on function public.mastery_system(uuid, uuid, timestamptz)     from public;
revoke execute on function public.at_risk_topics(uuid, timestamptz)           from public;
revoke execute on function public.topic_flags(uuid, timestamptz)              from public;

grant execute on function public.mastery_band(numeric)                    to authenticated;
grant execute on function public.mastery_topic(uuid, uuid, timestamptz)   to authenticated;
grant execute on function public.mastery_subject(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.mastery_system(uuid, uuid, timestamptz)  to authenticated;
grant execute on function public.at_risk_topics(uuid, timestamptz)        to authenticated;
grant execute on function public.topic_flags(uuid, timestamptz)           to authenticated;
-- mastery_topic_full stays internal (called by the definer functions above).

-- Optional: let the app read which config is live (no writes).
alter table public.mastery_config enable row level security;
drop policy if exists "mastery_config_select" on public.mastery_config;
create policy "mastery_config_select"
  on public.mastery_config for select to authenticated using (true);

/*
=== VERIFICATION — run in Supabase SQL Editor after applying migration ===

-- 1. Config check: exactly one active version
SELECT version, is_active, weights, constants FROM mastery_config;

-- 2. Band helper
SELECT mastery_band(NULL), mastery_band(0), mastery_band(40),
       mastery_band(60), mastery_band(80), mastery_band(100);

-- 3. Topic mastery (replace with real user_id and topic_id from your DB)
SELECT mastery_topic('USER_ID'::uuid, 'TOPIC_ID'::uuid, now());

-- 4. Subject mastery
SELECT mastery_subject('USER_ID'::uuid, 'SUBJECT_ID'::uuid, now());

-- 5. System mastery
SELECT mastery_system('USER_ID'::uuid, 'SYSTEM_ID'::uuid, now());

-- 6. At-risk topics
SELECT * FROM at_risk_topics('USER_ID'::uuid, now());

-- 7. Topic flags
SELECT * FROM topic_flags('USER_ID'::uuid, now());
*/
