-- ============================================================================
-- JUstep — Study Queue (018)
--
-- Builds the prioritized "what should I do now" list for a student, plus a
-- one-line summary. Pure read-side analytics over the Layer-1 event tables.
--
-- HARD RULES (same as the mastery engine, migration 017):
--   * AS-OF: every function takes an explicit `as_of timestamptz`. now() is
--     NEVER called inside a function body.
--   * SECURITY: SECURITY DEFINER (they aggregate across users via at_risk_topics
--     / median timings), so each guards `p_user_id = auth.uid()` unless admin.
--   * Idempotent: CREATE OR REPLACE; EXECUTE restricted to authenticated.
--
-- NOTES ON SCHEMA MAPPING (spec → actual columns):
--   * lecture_progress has NO 'started' status; the "started but not finished"
--     state is status = 'in_progress' (migration 015). Used below.
--   * the lecture label column is lectures.title (not .name).
--   * RECOMMENDED reuses public.at_risk_topics(p_user_id, as_of) from 017. That
--     function has its own auth guard; auth.uid() is preserved across the nested
--     SECURITY DEFINER call, so passing the same p_user_id stays authorized.
-- ============================================================================

-- ===========================================================================
-- 1. get_study_queue — the prioritized task list.
-- ===========================================================================
create or replace function public.get_study_queue(
  p_user_id uuid,
  as_of     timestamptz
)
returns table (
  item_type     text,   -- 'WRONG_QUESTION' | 'FLASHCARD_DUE' | 'LECTURE_UNFINISHED' | 'RECOMMENDED'
  ref_id        uuid,    -- question/flashcard/lecture/topic id (null for grouped rows)
  title         text,    -- human label
  reason        text,    -- the "explain why" line
  priority      text,    -- 'critical' | 'high' | 'medium'
  priority_rank int,     -- 1=critical, 2=high, 3=medium
  item_count    int,     -- how many underlying items
  est_minutes   int      -- estimated time
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  with
  -- ---- WRONG_QUESTIONS: latest attempt per question is wrong ----
  latest_attempt as (
    select distinct on (up.question_id) up.question_id, up.is_correct
    from public.user_progress up
    join public.questions q on q.id = up.question_id
    where up.user_id = p_user_id
      and up.answered_at <= as_of
      and up.is_correct is not null
      and q.deleted_at is null
    order by up.question_id, up.answered_at desc
  ),
  wrong_latest as (
    select question_id from latest_attempt where is_correct = false
  ),
  wrong_counts as (
    select up.question_id, count(*) as wrong_n
    from public.user_progress up
    join public.questions q on q.id = up.question_id
    where up.user_id = p_user_id
      and up.answered_at <= as_of
      and up.is_correct = false
      and q.deleted_at is null
    group by up.question_id
  ),
  wrong_agg as (
    select
      count(*)::int as cnt,
      coalesce(bool_or(wc.wrong_n >= 2), false) as repeated
    from wrong_latest wl
    left join wrong_counts wc on wc.question_id = wl.question_id
  ),
  -- ---- FLASHCARD_DUE: progress rows due at/over as_of ----
  fc_due as (
    select fp.flashcard_id, fp.next_review
    from public.flashcard_progress fp
    join public.flashcards f on f.id = fp.flashcard_id
    where fp.user_id = p_user_id
      and fp.next_review is not null
      and fp.next_review <= as_of
      and f.deleted_at is null
  ),
  fc_agg as (
    select
      count(*)::int as cnt,
      coalesce(bool_or(next_review < as_of - interval '3 days'), false) as overdue
    from fc_due
  ),
  -- ---- LECTURE_UNFINISHED: in_progress, most-recently-opened first, max 2 ----
  lec as (
    select lp.lecture_id, l.title, lp.last_opened_at
    from public.lecture_progress lp
    join public.lectures l on l.id = lp.lecture_id
    where lp.user_id = p_user_id
      and lp.status = 'in_progress'
    order by lp.last_opened_at desc nulls last
    limit 2
  ),
  -- ---- RECOMMENDED: single highest-severity at-risk topic ----
  risk as (
    select ar.topic_id, ar.topic_name, ar.severity
    from public.at_risk_topics(p_user_id, as_of) ar
    order by ar.severity desc
    limit 1
  )
  select * from (
    -- 1. WRONG_QUESTIONS (critical)
    select
      'WRONG_QUESTION'::text as item_type,
      null::uuid            as ref_id,
      'Retry wrong questions'::text as title,
      (case when wa.repeated
            then 'You missed some of these more than once'
            else 'Questions you answered incorrectly' end)::text as reason,
      'critical'::text as priority,
      1                as priority_rank,
      wa.cnt           as item_count,
      round(wa.cnt * 1.5)::int as est_minutes
    from wrong_agg wa
    where wa.cnt > 0

    union all
    -- 2. FLASHCARD_DUE (high)
    select
      'FLASHCARD_DUE'::text,
      null::uuid,
      'Review flashcards'::text,
      (case when fa.overdue
            then 'Some cards are overdue — review now to keep retention'
            else 'Cards scheduled for review today' end)::text,
      'high'::text,
      2,
      fa.cnt,
      greatest(1, round(fa.cnt * 0.5)::int)
    from fc_agg fa
    where fa.cnt > 0

    union all
    -- 3. LECTURE_UNFINISHED (high) — one row per unfinished lecture
    select
      'LECTURE_UNFINISHED'::text,
      lec.lecture_id,
      ('Continue ' || lec.title)::text,
      ('Started '
        || greatest(0, floor(extract(epoch from (as_of - coalesce(lec.last_opened_at, as_of))) / 86400))::int
        || ' days ago, not finished')::text,
      'high'::text,
      2,
      1,
      30
    from lec

    union all
    -- 4. RECOMMENDED (medium) — top at-risk topic
    select
      'RECOMMENDED'::text,
      risk.topic_id,
      'Solve recommended questions'::text,
      ('Mastery in ' || risk.topic_name || ' is at risk')::text,
      'medium'::text,
      3,
      10,
      20
    from risk
  ) queue
  order by queue.priority_rank asc, queue.est_minutes desc;
end $$;

-- ===========================================================================
-- 2. study_queue_summary — totals across the queue.
-- ===========================================================================
create or replace function public.study_queue_summary(
  p_user_id uuid,
  as_of     timestamptz
)
returns table (
  total_tasks   int,
  total_minutes int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    count(*)::int,
    coalesce(sum(q.est_minutes), 0)::int
  from public.get_study_queue(p_user_id, as_of) q;
end $$;

-- ===========================================================================
-- 3. Privileges — restrict to authenticated (functions are SECURITY DEFINER).
-- ===========================================================================
revoke execute on function public.get_study_queue(uuid, timestamptz)     from public;
revoke execute on function public.study_queue_summary(uuid, timestamptz)  from public;

grant execute on function public.get_study_queue(uuid, timestamptz)    to authenticated;
grant execute on function public.study_queue_summary(uuid, timestamptz) to authenticated;

/*
=== VERIFICATION — run in Supabase SQL Editor after applying migration ===

-- Replace USER_ID with a real profiles.id (run as that user, or as an admin).
SELECT * FROM get_study_queue('USER_ID'::uuid, now());
SELECT * FROM study_queue_summary('USER_ID'::uuid, now());
*/

-- ===========================================================================
-- 4. weak_concepts — the student's weakest topics, ranked by a composite score.
--
--    weakness_score =
--        wrong_count        * 3
--      + consecutive_wrong  * 5      -- last 2 attempts both wrong
--      + days_since_review  * 0.5
--      + overdue_flashcards * 2
--      - recent_correct     * 2      -- correct attempts in the last 7 days
--
--    Metric definitions (documented choices where the spec was ambiguous):
--      * wrong_count       = questions whose LATEST attempt is wrong, in topic
--      * total_attempts    = attempt ROWS on the topic's questions (so the
--                            ">= 3" filter means "≥3 attempts", per the spec's
--                            "avoid noise from 1-2 attempts")
--      * accuracy_pct      = correct attempts / total attempts * 100
--      * consecutive_wrong = questions whose 2 most-recent attempts are BOTH wrong
--      * days_since_review = days since last activity (question OR flashcard
--                            review) on the topic
--      * overdue_flashcards= topic flashcards with next_review < as_of
--      * recent_correct    = correct attempt rows in the last 7 days, in topic
-- ===========================================================================
create or replace function public.weak_concepts(
  p_user_id uuid,
  as_of     timestamptz
)
returns table (
  topic_id_out       uuid,
  topic_name         text,
  subject_name       text,
  wrong_count        int,
  total_attempts     int,
  accuracy_pct       numeric,
  days_since_review  int,
  overdue_flashcards int,
  weakness_score     numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  with
  -- every (non-deleted) question attempt in any topic, ranked newest-first per question
  attempts as (
    select up.question_id, q.topic_id, up.is_correct, up.answered_at,
           row_number() over (partition by up.question_id order by up.answered_at desc) as rn
    from public.user_progress up
    join public.questions q on q.id = up.question_id
    where up.user_id = p_user_id
      and up.answered_at <= as_of
      and up.is_correct is not null
      and q.deleted_at is null
      and q.topic_id is not null
  ),
  latest as (                       -- latest attempt per question
    select question_id, topic_id, is_correct from attempts where rn = 1
  ),
  last2 as (                        -- the 2 most-recent attempts per question
    select question_id, topic_id,
           count(*) as n2,
           bool_and(is_correct = false) as both_wrong
    from attempts where rn <= 2
    group by question_id, topic_id
  ),
  q_agg as (
    select a.topic_id,
           count(*) as total_attempts,
           count(*) filter (where a.is_correct) as correct_attempts,
           count(*) filter (where a.is_correct and a.answered_at > as_of - interval '7 days') as recent_correct,
           max(a.answered_at) as last_q
    from attempts a
    group by a.topic_id
  ),
  wrong_agg as (
    select topic_id, count(*) as wrong_count
    from latest where is_correct = false
    group by topic_id
  ),
  consec_agg as (
    select topic_id, count(*) as consecutive_wrong
    from last2 where n2 = 2 and both_wrong
    group by topic_id
  ),
  fr_agg as (                       -- last flashcard review per topic
    select f.topic_id, max(fr.reviewed_at) as last_fr
    from public.flashcard_reviews fr
    join public.flashcards f on f.id = fr.flashcard_id
    where fr.user_id = p_user_id and fr.reviewed_at <= as_of and f.deleted_at is null
    group by f.topic_id
  ),
  fp_agg as (                       -- overdue flashcards per topic
    select f.topic_id, count(*) as overdue_flashcards
    from public.flashcard_progress fp
    join public.flashcards f on f.id = fp.flashcard_id
    where fp.user_id = p_user_id and f.deleted_at is null
      and fp.next_review is not null and fp.next_review < as_of
    group by f.topic_id
  ),
  base as (
    select
      t.id   as topic_id,
      t.name as topic_name,
      s.name as subject_name,
      wa.wrong_count::int as wrong_count,
      qa.total_attempts::int as total_attempts,
      round(qa.correct_attempts::numeric / nullif(qa.total_attempts, 0) * 100, 1) as accuracy_pct,
      greatest(0, floor(extract(epoch from (as_of - greatest(qa.last_q, fra.last_fr))) / 86400))::int as days_since_review,
      coalesce(fpa.overdue_flashcards, 0)::int as overdue_flashcards,
      coalesce(ca.consecutive_wrong, 0)::int as consecutive_wrong,
      coalesce(qa.recent_correct, 0)::int as recent_correct
    from q_agg qa
    join wrong_agg wa on wa.topic_id = qa.topic_id
    join public.topics t on t.id = qa.topic_id
    join public.subjects s on s.id = t.subject_id
    left join consec_agg ca on ca.topic_id = qa.topic_id
    left join fr_agg fra on fra.topic_id = qa.topic_id
    left join fp_agg fpa on fpa.topic_id = qa.topic_id
    where qa.total_attempts >= 3 and wa.wrong_count >= 1
  )
  select
    base.topic_id as topic_id_out,
    base.topic_name,
    base.subject_name,
    base.wrong_count,
    base.total_attempts,
    base.accuracy_pct,
    base.days_since_review,
    base.overdue_flashcards,
    round(
      ( base.wrong_count        * 3
      + base.consecutive_wrong  * 5
      + base.days_since_review  * 0.5
      + base.overdue_flashcards * 2
      - base.recent_correct     * 2 )::numeric, 1) as weakness_score
  from base
  order by weakness_score desc
  limit 10;
end $$;

revoke execute on function public.weak_concepts(uuid, timestamptz) from public;
grant  execute on function public.weak_concepts(uuid, timestamptz) to authenticated;

/*
=== VERIFICATION (weak_concepts) ===
SELECT * FROM weak_concepts('USER_ID'::uuid, now());
*/
