-- ============================================================================
-- JUstep — exclude soft-deleted containers from analytics (020)
--
-- Migration 019 added `deleted_at` to systems / subjects / topics / lectures and
-- hid soft-deleted rows from students via RLS. But the analytics functions from
-- 017 & 018 are SECURITY DEFINER — they bypass RLS — and they enumerate topics /
-- subjects / lectures directly. So a soft-deleted container would still count in
-- mastery roll-ups, the at-risk list, weakness ranking, and the study queue.
--
-- This migration CREATE OR REPLACEs the six functions that touch container tables
-- to add `deleted_at IS NULL` filters. Signatures are unchanged, so existing
-- GRANT/REVOKE privileges are preserved automatically.
--
-- Cascade rule applied to the flat topic-list functions (at_risk_topics,
-- topic_flags, weak_concepts): a topic is excluded if the TOPIC is soft-deleted
-- OR its parent SUBJECT is soft-deleted (deleting a subject in the Admin panel
-- only marks the subject row; its topics stay active, so we must check the
-- parent). System-level deletion is NOT cascaded to topics — a subject can
-- legitimately exist with system_id NULL, so an unassigned/hidden system does
-- not invalidate its subjects' content.
--
-- NOT CHANGED: mastery_topic / mastery_topic_full (operate on a single given
-- topic's content — questions/flashcards, which already filter deleted_at — and
-- have no container joins) and study_queue_summary (delegates to
-- get_study_queue). The roll-ups handle the topic exclusion for them.
--
-- Idempotent (CREATE OR REPLACE). Reads/rewrites no data.
-- ============================================================================

-- ===========================================================================
-- 017 · mastery_subject — skip soft-deleted topics in the roll-up.
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
      and t.deleted_at is null
  );
end $$;

-- ===========================================================================
-- 017 · mastery_system — skip soft-deleted subjects in the roll-up.
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
             where t.subject_id = s.id and q.deleted_at is null and t.deleted_at is null)
        + (select count(*) from public.flashcards f join public.topics t on t.id = f.topic_id
             where t.subject_id = s.id and f.deleted_at is null and t.deleted_at is null)
      )::int as volume
    ) v
    where s.system_id = p_system_id
      and s.deleted_at is null
  );
end $$;

-- ===========================================================================
-- 017 · at_risk_topics — exclude deleted topics and topics under a deleted subject.
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
  join public.subjects sub on sub.id = t.subject_id
  cross join lateral public.mastery_topic_full(p_user_id, t.id, as_of) f
  where f.mastery is not null and f.k >= 50 and f.rho <= 0.6
    and t.deleted_at is null
    and sub.deleted_at is null
  order by round((f.k * (1 - f.rho) * f.volume)::numeric, 2) desc;
end $$;

-- ===========================================================================
-- 017 · topic_flags — same exclusion for both misconception and recognition rows.
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
    join public.topics tp on tp.id = q.topic_id
    join public.subjects sub on sub.id = tp.subject_id
    left join med m on m.question_id = up.question_id
    where up.user_id = p_user_id and up.answered_at <= as_of and q.topic_id is not null
      and tp.deleted_at is null and sub.deleted_at is null
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
    join public.subjects sub on sub.id = t.subject_id
    cross join lateral public.mastery_topic_full(p_user_id, t.id, as_of) f
    where f.comp_r >= 65 and f.comp_a <= 40
      and t.deleted_at is null and sub.deleted_at is null
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
-- 018 · get_study_queue — exclude soft-deleted lectures from LECTURE_UNFINISHED.
--       (RECOMMENDED already flows through the now-filtered at_risk_topics.)
-- ===========================================================================
create or replace function public.get_study_queue(
  p_user_id uuid,
  as_of     timestamptz
)
returns table (
  item_type     text,
  ref_id        uuid,
  title         text,
  reason        text,
  priority      text,
  priority_rank int,
  item_count    int,
  est_minutes   int
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
  -- LECTURE_UNFINISHED: in_progress, most-recently-opened first, max 2, active only
  lec as (
    select lp.lecture_id, l.title, lp.last_opened_at
    from public.lecture_progress lp
    join public.lectures l on l.id = lp.lecture_id
    where lp.user_id = p_user_id
      and lp.status = 'in_progress'
      and l.deleted_at is null
    order by lp.last_opened_at desc nulls last
    limit 2
  ),
  risk as (
    select ar.topic_id, ar.topic_name, ar.severity
    from public.at_risk_topics(p_user_id, as_of) ar
    order by ar.severity desc
    limit 1
  )
  select * from (
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
-- 018 · weak_concepts — exclude deleted topics and topics under a deleted subject.
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
  latest as (
    select question_id, topic_id, is_correct from attempts where rn = 1
  ),
  last2 as (
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
  fr_agg as (
    select f.topic_id, max(fr.reviewed_at) as last_fr
    from public.flashcard_reviews fr
    join public.flashcards f on f.id = fr.flashcard_id
    where fr.user_id = p_user_id and fr.reviewed_at <= as_of and f.deleted_at is null
    group by f.topic_id
  ),
  fp_agg as (
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
      and t.deleted_at is null and s.deleted_at is null
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

/*
=== VERIFICATION — run in Supabase SQL Editor after applying migration ===

-- Soft-delete a subject, then confirm its topics drop out of the analytics.
-- (Replace the ids with real ones; run as that user or an admin.)

-- Before/after a subject soft-delete, these should shrink accordingly:
SELECT * FROM weak_concepts('USER_ID'::uuid, now());
SELECT * FROM at_risk_topics('USER_ID'::uuid, now());
SELECT * FROM topic_flags('USER_ID'::uuid, now());
SELECT * FROM get_study_queue('USER_ID'::uuid, now());
SELECT mastery_system('USER_ID'::uuid, 'SYSTEM_ID'::uuid, now());
SELECT mastery_subject('USER_ID'::uuid, 'SUBJECT_ID'::uuid, now());

-- Sanity: a soft-deleted lecture should not appear as LECTURE_UNFINISHED.
-- UPDATE public.lectures SET deleted_at = now() WHERE id = 'LECTURE_ID';
*/
