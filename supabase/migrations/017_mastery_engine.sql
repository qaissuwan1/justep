-- ============================================================================
-- JUstep — Mastery Engine (017)
--
-- The core analytics layer. Computes a 0-100 Mastery score per Topic and rolls
-- it up to Subject and System, plus an At-Risk list and diagnostic flags.
--
-- DESIGN (approved model):
--   Mastery = K (Strength, 0-100) x rho (Retrievability, 0-1)
--     K   = renormalized blend of 4 components:
--             A Accuracy 40% | R Retention 35% | C Consistency 15% | Q Confidence 10%
--     rho = exp(-days_since_practice / S),  S = stability in days
--             S = S0 * (1 + beta * n_eff),  capped at ~21d
--   Bands: not_started | learning(<=40) | reviewing(<=60) | proficient(<=80) | mastered
--
-- HARD PRINCIPLES baked in here:
--   * AS-OF: every function takes an explicit `p_as_of timestamptz`. Nothing in
--     the bodies calls now() — mastery at time T is a pure function of the
--     append-only events up to T. (Decay happens purely because as_of advanced.)
--   * VERSIONED CONFIG: every weight / constant / threshold lives in
--     public.mastery_config (seeded v1 below). Nothing is hardcoded in logic.
--   * STAMPED OUTPUTS: every result carries the config_version + as_of it used.
--   * NULL vs ZERO: a topic with NO engagement returns band='not_started' and
--     mastery=NULL (never 0). A topic that was tried but failed returns a real
--     number (possibly ~0). In roll-ups, not-started topics count as 0 in the
--     denominator (honest coverage) but stay NULL at the topic level.
--   * RETENTION FROM OBSERVED RATINGS ONLY: R reads flashcard_reviews.rating,
--     never ease_factor / interval_days — so retuning the SR scheduler never
--     moves mastery.
--   * SECURITY: all functions are SECURITY DEFINER (they aggregate across users
--     for per-question median timings), so each guards `p_user = auth.uid()`
--     unless the caller is an admin.
--
-- Idempotent: tables use IF NOT EXISTS, functions use CREATE OR REPLACE, the
-- config seed uses ON CONFLICT DO NOTHING, indexes use IF NOT EXISTS.
-- ============================================================================

create extension if not exists pgcrypto;

-- ===========================================================================
-- 0. Normalize flashcard_reviews (created out-of-band; ensure a reliable
--    as-of timestamp). If it already exists this only ADDS a reviewed_at
--    column and backfills it from created_at when present.
-- ===========================================================================
create table if not exists public.flashcard_reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles (id)  on delete cascade,
  flashcard_id  uuid references public.flashcards (id) on delete set null,
  rating        text,
  interval_days int,
  ease_factor   numeric,
  next_review   timestamptz,
  reviewed_at   timestamptz not null default now()
);

-- Ensure reviewed_at exists if the table pre-existed without it. Add it
-- WITHOUT a default first so existing rows get NULL (not stamped "migration
-- time"), then backfill from created_at if that column exists.
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

-- New rows get now() going forward; promote to NOT NULL only if fully backfilled.
alter table public.flashcard_reviews alter column reviewed_at set default now();
do $$
begin
  if not exists (select 1 from public.flashcard_reviews where reviewed_at is null) then
    alter table public.flashcard_reviews alter column reviewed_at set not null;
  end if;
end $$;

alter table public.flashcard_reviews enable row level security;
drop policy if exists "flashcard_reviews_manage_own" on public.flashcard_reviews;
create policy "flashcard_reviews_manage_own"
  on public.flashcard_reviews for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes the engine leans on.
create index if not exists idx_fcr_user_time   on public.flashcard_reviews (user_id, reviewed_at);
create index if not exists idx_fcr_card        on public.flashcard_reviews (flashcard_id);
create index if not exists idx_up_user_time    on public.user_progress     (user_id, answered_at);

-- ===========================================================================
-- 1. Versioned config — all weights, constants, thresholds. Seed v1.
-- ===========================================================================
create table if not exists public.mastery_config (
  version                        int primary key,

  -- component weights (renormalized over whichever components are present)
  w_accuracy                     numeric not null default 0.40,
  w_retention                    numeric not null default 0.35,
  w_consistency                  numeric not null default 0.15,
  w_confidence                   numeric not null default 0.10,

  -- A: Bayesian shrinkage so 1-correct != 100% (1 correct -> 62.5%)
  accuracy_prior_p0              numeric not null default 0.5,
  accuracy_prior_alpha           numeric not null default 3,

  -- R: rating -> retention quality, plus maturity
  q_again                        numeric not null default 0.0,
  q_hard                         numeric not null default 0.5,
  q_good                         numeric not null default 0.85,
  q_easy                         numeric not null default 1.0,
  retention_maturity_target      int     not null default 2,   -- reviews to count as "mature"

  -- C: distributed-practice target + spacing
  consistency_target_days        int     not null default 4,

  -- Q: confidence categories (time x correctness) + "fast" definition
  conf_fast_correct              numeric not null default 1.0,
  conf_slow_correct              numeric not null default 0.7,
  conf_slow_wrong                numeric not null default 0.3,
  conf_fast_wrong                numeric not null default 0.0,
  conf_fast_ratio                numeric not null default 0.5,  -- fast = time <= ratio * baseline median

  -- Forgetting / retrievability
  stability_s0                   numeric not null default 3,
  stability_beta                 numeric not null default 2.5,
  stability_cap                  numeric not null default 21,

  -- Recency weighting within components, and how far back to look
  recency_halflife_days          numeric not null default 14,
  evidence_window_days           int     not null default 365, -- generous; recency half-life does the real fading

  -- Bands (on final mastery 0-100)
  band_learning_max              numeric not null default 40,
  band_reviewing_max             numeric not null default 60,
  band_proficient_max            numeric not null default 80,

  -- At-Risk gate (was strong, now fading)
  atrisk_k_min                   numeric not null default 50,
  atrisk_rho_max                 numeric not null default 0.6,

  -- Recognition-without-application flag (high retention, low accuracy)
  rwa_retention_min              numeric not null default 65,
  rwa_accuracy_max               numeric not null default 40,

  -- Two-level misconception (count of fast+wrong on the SAME question)
  misconception_warn_count       int     not null default 2,
  misconception_entrenched_count int     not null default 3,

  created_at                     timestamptz not null default now(),
  notes                          text
);

insert into public.mastery_config (version, notes)
values (1, 'Initial approved model: weights 40/35/15/10; S0=3 beta=2.5 cap=21; '
        || 'shrinkage a=3 p0=0.5; misconception 2x warn / 3x entrenched; RWA R>=65 & A<=40.')
on conflict (version) do nothing;

alter table public.mastery_config enable row level security;
drop policy if exists "mastery_config_select" on public.mastery_config;
create policy "mastery_config_select"
  on public.mastery_config for select to authenticated using (true);
drop policy if exists "mastery_config_admin_write" on public.mastery_config;
create policy "mastery_config_admin_write"
  on public.mastery_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===========================================================================
-- 2. Band helper (reads thresholds from the latest config). NULL -> not_started.
-- ===========================================================================
create or replace function public.mastery_band(p_mastery numeric)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_mastery is null then 'not_started'
    else (
      select case
        when p_mastery <= c.band_learning_max   then 'learning'
        when p_mastery <= c.band_reviewing_max  then 'reviewing'
        when p_mastery <= c.band_proficient_max then 'proficient'
        else 'mastered'
      end
      from public.mastery_config c
      order by c.version desc
      limit 1
    )
  end;
$$;

-- ===========================================================================
-- 3. mastery_topic — the heart. Returns one row with the full breakdown.
--    NULL mastery / band='not_started' when there is no evidence at all.
-- ===========================================================================
create or replace function public.mastery_topic(
  p_user  uuid,
  p_topic uuid,
  p_as_of timestamptz
)
returns table (
  topic_id            uuid,
  config_version      int,
  as_of               timestamptz,
  evidence            boolean,
  band                text,
  mastery             numeric,
  strength_k          numeric,
  retrievability_rho  numeric,
  comp_accuracy       numeric,
  comp_retention      numeric,
  comp_consistency    numeric,
  comp_confidence     numeric,
  last_practice       timestamptz,
  days_since_practice numeric,
  question_volume     int,
  flashcard_volume    int,
  volume              int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg            public.mastery_config%rowtype;
  v_qvol         int;
  v_fvol         int;
  v_ev_count     int;
  v_last         timestamptz;
  v_distinct_day int;
  v_neff         int;
  v_span         double precision;
  v_A            double precision;
  v_R            double precision;
  v_C            double precision;
  v_Q            double precision;
  v_num          double precision := 0;
  v_den          double precision := 0;
  v_K            double precision;
  v_S            double precision;
  v_days         double precision;
  v_rho          double precision;
  v_mastery      double precision;
begin
  -- ---- security: only your own data (admins may read anyone) ----
  if p_user is distinct from auth.uid() and not public.is_admin() then
    raise exception 'not authorized to read mastery for another user';
  end if;

  select * into cfg from public.mastery_config order by version desc limit 1;
  if cfg.version is null then
    raise exception 'mastery_config is empty; seed v1 first';
  end if;

  -- ---- content volume (ACTIVE items only) ----
  select count(*) into v_qvol
  from public.questions where topic_id = p_topic and deleted_at is null;
  select count(*) into v_fvol
  from public.flashcards where topic_id = p_topic and deleted_at is null;

  -- ---- unified event stream for this user+topic within the window ----
  -- (questions answered + flashcards reviewed). Drives evidence test,
  -- last_practice, distinct practice days, span, and n_eff (successful days).
  with ev as (
    select up.answered_at as ts, (up.is_correct is true) as success
    from public.user_progress up
    join public.questions q on q.id = up.question_id
    where up.user_id = p_user and q.topic_id = p_topic
      and up.answered_at <= p_as_of
      and up.answered_at >= p_as_of - make_interval(days => cfg.evidence_window_days)
    union all
    select fr.reviewed_at as ts, (fr.rating in ('good','easy')) as success
    from public.flashcard_reviews fr
    join public.flashcards f on f.id = fr.flashcard_id
    where fr.user_id = p_user and f.topic_id = p_topic
      and fr.reviewed_at <= p_as_of
      and fr.reviewed_at >= p_as_of - make_interval(days => cfg.evidence_window_days)
  )
  select
    count(*),
    max(ts),
    count(distinct date_trunc('day', ts)),
    count(distinct date_trunc('day', ts)) filter (where success),
    extract(epoch from (max(ts) - min(ts))) / 86400.0
  into v_ev_count, v_last, v_distinct_day, v_neff, v_span
  from ev;

  -- ---- NOT STARTED: no engagement at all -> NULL mastery (never 0) ----
  if coalesce(v_ev_count, 0) = 0 then
    return query select
      p_topic, cfg.version, p_as_of, false, 'not_started',
      null::numeric, null::numeric, null::numeric,
      null::numeric, null::numeric, null::numeric, null::numeric,
      null::timestamptz, null::numeric,
      v_qvol, v_fvol, (v_qvol + v_fvol);
    return;
  end if;

  -- ---- A: Accuracy (latest non-null attempt per question, recency-weighted,
  --         Bayesian shrinkage toward p0 so tiny samples can't read 100%) ----
  select case when sum(s.w) > 0
              then ((sum(s.w * s.c) + cfg.accuracy_prior_alpha * cfg.accuracy_prior_p0)
                    / (sum(s.w) + cfg.accuracy_prior_alpha)) * 100
         end
  into v_A
  from (
    select distinct on (up.question_id)
      power(0.5::double precision,
            greatest(0::double precision,
                     extract(epoch from (p_as_of - up.answered_at)) / 86400.0)
            / cfg.recency_halflife_days::double precision) as w,
      (case when up.is_correct then 1 else 0 end)::double precision as c
    from public.user_progress up
    join public.questions q on q.id = up.question_id
    where up.user_id = p_user and q.topic_id = p_topic
      and up.is_correct is not null
      and up.answered_at <= p_as_of
      and up.answered_at >= p_as_of - make_interval(days => cfg.evidence_window_days)
    order by up.question_id, up.answered_at desc
  ) s;

  -- ---- R: Retention from OBSERVED ratings only (recency-weighted quality x
  --         maturity). Never reads ease_factor / interval_days. ----
  with topic_f as (
    select id from public.flashcards where topic_id = p_topic
  ),
  rv as (
    select fr.flashcard_id,
      power(0.5::double precision,
            greatest(0::double precision,
                     extract(epoch from (p_as_of - fr.reviewed_at)) / 86400.0)
            / cfg.recency_halflife_days::double precision) as w,
      (case fr.rating
         when 'again' then cfg.q_again
         when 'hard'  then cfg.q_hard
         when 'good'  then cfg.q_good
         when 'easy'  then cfg.q_easy
         else cfg.q_good
       end)::double precision as q
    from public.flashcard_reviews fr
    join topic_f t on t.id = fr.flashcard_id
    where fr.user_id = p_user
      and fr.reviewed_at <= p_as_of
      and fr.reviewed_at >= p_as_of - make_interval(days => cfg.evidence_window_days)
  ),
  card_counts as (
    select flashcard_id, count(*) as n from rv group by flashcard_id
  )
  select case when (select sum(w) from rv) > 0
              then 100.0
                 * (select sum(w * q) / sum(w) from rv)
                 * (0.5 + 0.5 * coalesce(
                       (select count(*) filter (where n >= cfg.retention_maturity_target)::numeric
                          from card_counts)
                       / nullif((select count(*) from card_counts), 0), 0))
         end
  into v_R;

  -- ---- C: Consistency = coverage of distinct practice days x spacing bonus ----
  v_C := 100.0
       * least(1.0, v_distinct_day::numeric / cfg.consistency_target_days)
       * (0.6 + 0.4 * least(1.0, coalesce(v_span, 0) / 7.0));

  -- ---- Q: Confidence inferred from time x correctness. "fast" is RELATIVE:
  --         per-question median time (all users), fallback to this user's
  --         median, fallback 60s. fast+wrong is the worst (confident error). ----
  with topic_q as (
    select id from public.questions where topic_id = p_topic
  ),
  med as (
    select up.question_id,
      percentile_cont(0.5) within group (order by up.time_spent_seconds) as m
    from public.user_progress up
    join topic_q t on t.id = up.question_id
    where up.time_spent_seconds is not null and up.answered_at <= p_as_of
    group by up.question_id
  ),
  umed as (
    select percentile_cont(0.5) within group (order by time_spent_seconds) as m
    from public.user_progress
    where user_id = p_user and time_spent_seconds is not null and answered_at <= p_as_of
  ),
  latest as (
    select distinct on (up.question_id)
      up.question_id, up.is_correct, up.time_spent_seconds, up.answered_at
    from public.user_progress up
    join topic_q t on t.id = up.question_id
    where up.user_id = p_user
      and up.is_correct is not null
      and up.time_spent_seconds is not null
      and up.answered_at <= p_as_of
      and up.answered_at >= p_as_of - make_interval(days => cfg.evidence_window_days)
    order by up.question_id, up.answered_at desc
  )
  select case when sum(s.w) > 0 then 100.0 * sum(s.w * s.val) / sum(s.w) end
  into v_Q
  from (
    select
      power(0.5::double precision,
            greatest(0::double precision,
                     extract(epoch from (p_as_of - l.answered_at)) / 86400.0)
            / cfg.recency_halflife_days::double precision) as w,
      (case
         when l.is_correct
           and l.time_spent_seconds <= cfg.conf_fast_ratio * coalesce(m.m, (select m from umed), 60)
           then cfg.conf_fast_correct
         when l.is_correct
           then cfg.conf_slow_correct
         when l.time_spent_seconds <= cfg.conf_fast_ratio * coalesce(m.m, (select m from umed), 60)
           then cfg.conf_fast_wrong
         else cfg.conf_slow_wrong
       end)::double precision as val
    from latest l
    left join med m on m.question_id = l.question_id
  ) s;

  -- ---- K: blend present components, renormalizing the weights ----
  if v_A is not null then v_num := v_num + cfg.w_accuracy    * v_A; v_den := v_den + cfg.w_accuracy;    end if;
  if v_R is not null then v_num := v_num + cfg.w_retention   * v_R; v_den := v_den + cfg.w_retention;   end if;
  if v_C is not null then v_num := v_num + cfg.w_consistency * v_C; v_den := v_den + cfg.w_consistency; end if;
  if v_Q is not null then v_num := v_num + cfg.w_confidence  * v_Q; v_den := v_den + cfg.w_confidence;  end if;
  v_K := case when v_den > 0 then v_num / v_den else null end;

  -- ---- rho: forgetting curve since last practice. Stability grows with the
  --          number of successful, well-spaced practice days (n_eff). ----
  v_S    := least(cfg.stability_cap::double precision,
                  cfg.stability_s0::double precision
                    * (1 + cfg.stability_beta::double precision * coalesce(v_neff, 0)));
  v_days := greatest(0::double precision,
                     extract(epoch from (p_as_of - v_last)) / 86400.0);
  v_rho  := exp(-(v_days / nullif(v_S, 0)));

  v_mastery := v_K * v_rho;

  return query select
    p_topic,
    cfg.version,
    p_as_of,
    true,
    public.mastery_band(round(v_mastery::numeric, 1)),
    round(v_mastery::numeric, 1),
    round(v_K::numeric, 1),
    round(v_rho::numeric, 4),
    round(v_A::numeric, 1),
    round(v_R::numeric, 1),
    round(v_C::numeric, 1),
    round(v_Q::numeric, 1),
    v_last,
    round(v_days::numeric, 2),
    v_qvol, v_fvol, (v_qvol + v_fvol);
end $$;

-- ===========================================================================
-- 4. Roll-ups — volume-weighted; not-started topics count as 0 in the
--    denominator (honest coverage) but a subject/system with NO started
--    children stays NULL/not_started (preserves the null-vs-zero distinction).
-- ===========================================================================
create or replace function public.mastery_subject(
  p_user    uuid,
  p_subject uuid,
  p_as_of   timestamptz
)
returns table (
  subject_id     uuid,
  config_version int,
  as_of          timestamptz,
  band           text,
  mastery        numeric,
  total_volume   int,
  topics_total   int,
  topics_started int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ver     int;
  v_tv      int;
  v_topics  int;
  v_started int;
  v_mastery numeric;
begin
  if p_user is distinct from auth.uid() and not public.is_admin() then
    raise exception 'not authorized to read mastery for another user';
  end if;

  select version into v_ver from public.mastery_config order by version desc limit 1;

  select
    coalesce(sum(m.volume), 0),
    count(*),
    count(*) filter (where m.band <> 'not_started'),
    case when sum(m.volume) > 0 and count(*) filter (where m.band <> 'not_started') > 0
         then round(sum(m.volume * coalesce(m.mastery, 0))::numeric / sum(m.volume), 1)
    end
  into v_tv, v_topics, v_started, v_mastery
  from public.topics t
  cross join lateral public.mastery_topic(p_user, t.id, p_as_of) m
  where t.subject_id = p_subject and m.volume > 0;

  return query select
    p_subject, v_ver, p_as_of,
    public.mastery_band(v_mastery),
    v_mastery,
    coalesce(v_tv, 0),
    coalesce(v_topics, 0),
    coalesce(v_started, 0);
end $$;

create or replace function public.mastery_system(
  p_user   uuid,
  p_system uuid,
  p_as_of  timestamptz
)
returns table (
  system_id        uuid,
  config_version   int,
  as_of            timestamptz,
  band             text,
  mastery          numeric,
  total_volume     int,
  subjects_total   int,
  subjects_started int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ver     int;
  v_tv      int;
  v_subs    int;
  v_started int;
  v_mastery numeric;
begin
  if p_user is distinct from auth.uid() and not public.is_admin() then
    raise exception 'not authorized to read mastery for another user';
  end if;

  select version into v_ver from public.mastery_config order by version desc limit 1;

  select
    coalesce(sum(ms.total_volume), 0),
    count(*),
    count(*) filter (where ms.band <> 'not_started'),
    case when sum(ms.total_volume) > 0 and count(*) filter (where ms.band <> 'not_started') > 0
         then round(sum(ms.total_volume * coalesce(ms.mastery, 0))::numeric / sum(ms.total_volume), 1)
    end
  into v_tv, v_subs, v_started, v_mastery
  from public.subjects s
  cross join lateral public.mastery_subject(p_user, s.id, p_as_of) ms
  where s.system_id = p_system and ms.total_volume > 0;

  return query select
    p_system, v_ver, p_as_of,
    public.mastery_band(v_mastery),
    v_mastery,
    coalesce(v_tv, 0),
    coalesce(v_subs, 0),
    coalesce(v_started, 0);
end $$;

-- ===========================================================================
-- 5. At-Risk — topics that were strong (K >= min) but are fading (rho <= max).
--    Severity = K x (1 - rho) x volume keeps "was strong, now slipping, and
--    high-yield" above "never built". Reason distinguishes recent lapses from
--    plain forgetting; misconceptions are surfaced by topic_flags() instead.
-- ===========================================================================
create or replace function public.at_risk_topics(
  p_user  uuid,
  p_as_of timestamptz
)
returns table (
  topic_id         uuid,
  topic_name       text,
  subject_id       uuid,
  subject_name     text,
  days_ago         int,
  predicted_recall int,
  mastery          numeric,
  strength_k       numeric,
  reason           text,
  severity         numeric,
  config_version   int,
  as_of            timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.mastery_config%rowtype;
begin
  if p_user is distinct from auth.uid() and not public.is_admin() then
    raise exception 'not authorized to read mastery for another user';
  end if;

  select * into cfg from public.mastery_config order by version desc limit 1;

  return query
  select
    t.id, t.name, sub.id, sub.name,
    round(m.days_since_practice)::int,
    round(m.retrievability_rho * 100)::int,
    m.mastery, m.strength_k,
    case when (
      select coalesce(count(*) filter (where fr.rating = 'again')::numeric / nullif(count(*), 0), 0)
      from public.flashcard_reviews fr
      join public.flashcards f on f.id = fr.flashcard_id
      where f.topic_id = t.id and fr.user_id = p_user
        and fr.reviewed_at <= p_as_of
        and fr.reviewed_at >= p_as_of - interval '7 days'
    ) >= 0.4 then 'frequent_lapses' else 'forgetting' end,
    round((m.strength_k * (1 - m.retrievability_rho) * m.volume)::numeric, 1),
    cfg.version, p_as_of
  from public.topics t
  join public.subjects sub on sub.id = t.subject_id
  cross join lateral public.mastery_topic(p_user, t.id, p_as_of) m
  where m.band <> 'not_started'
    and m.strength_k >= cfg.atrisk_k_min
    and m.retrievability_rho <= cfg.atrisk_rho_max
  order by (m.strength_k * (1 - m.retrievability_rho) * m.volume) desc;
end $$;

-- ===========================================================================
-- 6. Diagnostic flags — feed the Weakness engine + dashboard:
--    * misconception_warning      : >= 2 fast+wrong on the SAME question
--    * entrenched_misconception   : >= 3 fast+wrong on the SAME question
--    * recognition_without_application : high retention (R) but low accuracy (A)
-- ===========================================================================
create or replace function public.topic_flags(
  p_user  uuid,
  p_as_of timestamptz
)
returns table (
  flag_type      text,
  topic_id       uuid,
  topic_name     text,
  question_id    uuid,
  metric_a       numeric,
  metric_b       numeric,
  detail         text,
  config_version int,
  as_of          timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.mastery_config%rowtype;
begin
  if p_user is distinct from auth.uid() and not public.is_admin() then
    raise exception 'not authorized to read mastery for another user';
  end if;

  select * into cfg from public.mastery_config order by version desc limit 1;

  return query
  -- A) misconception flags (count fast+wrong on the same question, all attempts)
  with med as (
    select up.question_id,
      percentile_cont(0.5) within group (order by up.time_spent_seconds) as m
    from public.user_progress up
    where up.time_spent_seconds is not null and up.answered_at <= p_as_of
    group by up.question_id
  ),
  umed as (
    select percentile_cont(0.5) within group (order by time_spent_seconds) as m
    from public.user_progress
    where user_id = p_user and time_spent_seconds is not null and answered_at <= p_as_of
  ),
  fw as (
    select up.question_id, q.topic_id,
      count(*) filter (
        where up.is_correct = false
          and up.time_spent_seconds is not null
          and up.time_spent_seconds <= cfg.conf_fast_ratio * coalesce(md.m, (select m from umed), 60)
      ) as n_fw
    from public.user_progress up
    join public.questions q on q.id = up.question_id
    left join med md on md.question_id = up.question_id
    where up.user_id = p_user and up.answered_at <= p_as_of and q.topic_id is not null
    group by up.question_id, q.topic_id
  )
  select
    case when fw.n_fw >= cfg.misconception_entrenched_count
         then 'entrenched_misconception' else 'misconception_warning' end,
    fw.topic_id, tp.name, fw.question_id,
    fw.n_fw::numeric, null::numeric,
    fw.n_fw || ' fast-and-wrong attempts on this question',
    cfg.version, p_as_of
  from fw
  join public.topics tp on tp.id = fw.topic_id
  where fw.n_fw >= cfg.misconception_warn_count

  union all
  -- B) recognition-without-application (memorizes cards, fails questions)
  select
    'recognition_without_application',
    t.id, t.name, null::uuid,
    m.comp_retention, m.comp_accuracy,
    'High flashcard retention but low question accuracy',
    cfg.version, p_as_of
  from public.topics t
  cross join lateral public.mastery_topic(p_user, t.id, p_as_of) m
  where m.comp_retention is not null and m.comp_accuracy is not null
    and m.comp_retention >= cfg.rwa_retention_min
    and m.comp_accuracy  <= cfg.rwa_accuracy_max;
end $$;

-- ===========================================================================
-- 7. Grants — callable by signed-in users (each guards its own user_id inside).
-- ===========================================================================
grant execute on function public.mastery_band(numeric)                       to authenticated;
grant execute on function public.mastery_topic(uuid, uuid, timestamptz)      to authenticated;
grant execute on function public.mastery_subject(uuid, uuid, timestamptz)    to authenticated;
grant execute on function public.mastery_system(uuid, uuid, timestamptz)     to authenticated;
grant execute on function public.at_risk_topics(uuid, timestamptz)           to authenticated;
grant execute on function public.topic_flags(uuid, timestamptz)              to authenticated;
