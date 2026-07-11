-- ============================================================================
-- JUstep — soft-delete for container tables (019)
--
-- PROBLEM: systems / subjects / topics / lectures still hard-DELETE in the Admin
-- panel, and those deletes cascade into child questions/flashcards (FK
-- ON DELETE CASCADE / SET NULL) — wiping content that may carry student
-- activity. Migration 016 only added `deleted_at` to questions + flashcards;
-- the container tables never got it.
--
-- FIX: add a `deleted_at` soft-delete marker to each container table, a partial
-- "active rows" index, and tighten each SELECT policy so students see only
-- non-deleted rows (admins still see everything, to manage / restore).
--
-- This migration reads/rewrites NO data. Idempotent: ADD COLUMN IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, drop-then-recreate policies by their existing
-- names.
--
-- NOTE: the app still hard-deletes these tables today. Switching the Admin
-- panel to UPDATE ... SET deleted_at = now() (and adding deleted_at IS NULL
-- filters to reads) is a SEPARATE follow-up step, intentionally not done here.
-- ============================================================================

-- 1. Soft-delete markers (NULL = active) -------------------------------------
alter table public.systems  add column if not exists deleted_at timestamptz;
alter table public.subjects add column if not exists deleted_at timestamptz;
alter table public.topics   add column if not exists deleted_at timestamptz;
alter table public.lectures add column if not exists deleted_at timestamptz;

-- 2. Partial "active set" indexes --------------------------------------------
create index if not exists idx_systems_active  on public.systems  (deleted_at) where deleted_at is null;
create index if not exists idx_subjects_active on public.subjects (deleted_at) where deleted_at is null;
create index if not exists idx_topics_active   on public.topics   (deleted_at) where deleted_at is null;
create index if not exists idx_lectures_active on public.lectures (deleted_at) where deleted_at is null;

-- 3. Hide soft-deleted rows from students via RLS ----------------------------
-- Replaces the old `using (true)` SELECT policies. Students see only active
-- rows; admins still see everything (is_admin() from migration 003). The
-- existing admin-write policies (`for all using (public.is_admin())`) are
-- unchanged — an admin "delete" becomes an UPDATE of deleted_at, still covered.

drop policy if exists "systems_select_authenticated" on public.systems;
create policy "systems_select_authenticated"
  on public.systems for select
  to authenticated
  using (deleted_at is null or public.is_admin());

drop policy if exists "subjects_select_authenticated" on public.subjects;
create policy "subjects_select_authenticated"
  on public.subjects for select
  to authenticated
  using (deleted_at is null or public.is_admin());

drop policy if exists "topics_select_authenticated" on public.topics;
create policy "topics_select_authenticated"
  on public.topics for select
  to authenticated
  using (deleted_at is null or public.is_admin());

drop policy if exists "lectures_select_authenticated" on public.lectures;
create policy "lectures_select_authenticated"
  on public.lectures for select
  to authenticated
  using (deleted_at is null or public.is_admin());

/*
=== VERIFICATION — run in Supabase SQL Editor after applying migration ===

-- 1. Columns exist on all four tables
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'deleted_at'
  AND table_name IN ('systems','subjects','topics','lectures')
ORDER BY table_name;

-- 2. Partial indexes exist
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('idx_systems_active','idx_subjects_active','idx_topics_active','idx_lectures_active')
ORDER BY indexname;

-- 3. SELECT policies now reference deleted_at
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN (
    'systems_select_authenticated','subjects_select_authenticated',
    'topics_select_authenticated','lectures_select_authenticated'
  )
ORDER BY tablename;
*/
