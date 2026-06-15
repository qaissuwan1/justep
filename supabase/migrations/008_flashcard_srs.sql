-- ============================================================================
-- JUstep — flashcard spaced-repetition + scheduling support (008)
-- Adds the columns the Flashcards review page reads/writes (SM-2-style SRS),
-- a unique key for upserts, and exam-date fields used to compress intervals.
-- ============================================================================

-- 1. SRS state on flashcard_progress -----------------------------------------
alter table public.flashcard_progress
  add column if not exists last_reviewed timestamptz,
  add column if not exists ease_factor   numeric not null default 2.5,
  add column if not exists interval_days int     not null default 0,
  add column if not exists repetitions   int     not null default 0,
  add column if not exists exam_boost    boolean not null default false;

-- 2. Unique (user_id, flashcard_id) so the review upsert can target onConflict.
--    Guarded in a DO block to stay idempotent. If duplicate rows already exist
--    this will raise — dedupe them first (there should be at most one progress
--    row per user/card by design).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'flashcard_progress_user_card_key'
  ) then
    alter table public.flashcard_progress
      add constraint flashcard_progress_user_card_key unique (user_id, flashcard_id);
  end if;
end $$;

-- 3. Exam dates --------------------------------------------------------------
alter table public.subjects
  add column if not exists exam_date date;

alter table public.lectures
  add column if not exists lecture_date date;
