-- ============================================================================
-- JUstep — content immutability / preserve learning history (016)
--
-- PROBLEM: every per-user table referencing questions/flashcards used
-- ON DELETE CASCADE, so an admin hard-delete silently wiped attempt history,
-- SR state, marks, and review logs — destroying mastery/weakness data forever.
--
-- FIX: switch those FKs away from CASCADE (SET NULL where the attempt should
-- survive, RESTRICT where the column can't be null), and add a `deleted_at`
-- soft-delete marker so admin "delete" hides content instead of erasing it.
--
-- No data is read or rewritten. Idempotent: FK swaps drop-if-exists then
-- recreate under the same (Postgres-default) names; columns/indexes/policies
-- use IF NOT EXISTS / drop-then-create.
--
-- NOTE ON CONSTRAINT NAMES: the original tables declared these FKs inline, so
-- Postgres auto-named them `<table>_<column>_fkey`. This migration drops/recreates
-- exactly those names.
-- ============================================================================

-- Canonical append-only review log. This object originally existed only as
-- remote schema drift; defining it here makes a fresh migration chain
-- reproducible. Migration 017 builds analytics on reviewed_at.
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

-- 1. user_progress.question_id : CASCADE -> SET NULL --------------------------
-- Keep the attempt (is_correct, time_spent, selected_answer) even if the
-- question row is hard-deleted. (Soft-delete keeps question_id valid, so this
-- only fires on a genuine hard delete — a safety net, not the normal path.)
alter table public.user_progress drop constraint if exists user_progress_question_id_fkey;
alter table public.user_progress
  add constraint user_progress_question_id_fkey
  foreign key (question_id) references public.questions (id) on delete set null;

-- 2. question_marks.question_id : CASCADE -> RESTRICT -------------------------
-- question_id is part of the PRIMARY KEY (NOT NULL), so SET NULL is impossible.
-- RESTRICT blocks hard-deleting a marked question — which is what we want, since
-- deletes become soft-deletes.
alter table public.question_marks drop constraint if exists question_marks_question_id_fkey;
alter table public.question_marks
  add constraint question_marks_question_id_fkey
  foreign key (question_id) references public.questions (id) on delete restrict;

-- 3. flashcard_progress.flashcard_id : CASCADE -> SET NULL --------------------
-- Preserve SR state history if a card is hard-deleted. (UNIQUE(user_id,
-- flashcard_id) tolerates multiple NULL flashcard_id rows — NULLs are distinct.)
alter table public.flashcard_progress drop constraint if exists flashcard_progress_flashcard_id_fkey;
alter table public.flashcard_progress
  add constraint flashcard_progress_flashcard_id_fkey
  foreign key (flashcard_id) references public.flashcards (id) on delete set null;

-- 4. flashcard_reviews.flashcard_id : CASCADE -> SET NULL ---------------------
-- Review history is the backbone of retention. Ensure the column is nullable so
-- SET NULL is valid (no-op if already nullable).
alter table public.flashcard_reviews alter column flashcard_id drop not null;
alter table public.flashcard_reviews drop constraint if exists flashcard_reviews_flashcard_id_fkey;
alter table public.flashcard_reviews
  add constraint flashcard_reviews_flashcard_id_fkey
  foreign key (flashcard_id) references public.flashcards (id) on delete set null;

-- 5. Soft-delete markers ------------------------------------------------------
-- Admin "delete" = set deleted_at = now() (handled in app, later). NULL = active.
alter table public.questions  add column if not exists deleted_at timestamptz;
alter table public.flashcards add column if not exists deleted_at timestamptz;

-- Partial indexes over the active set (the rows almost every query wants).
create index if not exists idx_questions_active  on public.questions  (subject_id) where deleted_at is null;
create index if not exists idx_flashcards_active on public.flashcards (subject_id) where deleted_at is null;

-- 6. Hide soft-deleted content from students via RLS -------------------------
-- Replaces the old `using (true)` SELECT policies. Students see only active rows;
-- admins still see everything (to manage / restore). `published` stays an
-- app-level filter as before; this only adds the deleted_at gate.
drop policy if exists "questions_select_authenticated" on public.questions;
create policy "questions_select_authenticated"
  on public.questions for select
  to authenticated
  using (deleted_at is null or public.is_admin());

drop policy if exists "flashcards_select_authenticated" on public.flashcards;
create policy "flashcards_select_authenticated"
  on public.flashcards for select
  to authenticated
  using (deleted_at is null or public.is_admin());
