-- ============================================================================
-- JUstep — admin roles, question publish flag, and admin write policies (003)
-- Required for the Admin panel (src/pages/Admin.jsx) to read/write content.
-- ============================================================================

-- 1. Roles ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists role text not null default 'student'
  check (role in ('student', 'instructor', 'admin'));

-- 2. Publish flag on questions -------------------------------------------------
alter table public.questions
  add column if not exists published boolean not null default true;

-- 3. Admin helper --------------------------------------------------------------
-- SECURITY DEFINER + a stable search_path so this can be called inside RLS
-- policies without recursively triggering profiles' own RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 4. Admin write policies ------------------------------------------------------
-- Content tables already allow SELECT to authenticated users (migration 001).
-- These add INSERT/UPDATE/DELETE for admins only.

-- subjects
drop policy if exists "subjects_admin_write" on public.subjects;
create policy "subjects_admin_write"
  on public.subjects for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- questions
drop policy if exists "questions_admin_write" on public.questions;
create policy "questions_admin_write"
  on public.questions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- flashcards
drop policy if exists "flashcards_admin_write" on public.flashcards;
create policy "flashcards_admin_write"
  on public.flashcards for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 5. Let admins read every profile for User Management ------------------------
-- (migration 001 already allows authenticated users to select profiles; this is
--  kept explicit in case that policy is tightened later.)
drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read"
  on public.profiles for select
  to authenticated
  using (public.is_admin() or auth.uid() = id);

-- ============================================================================
-- Bootstrap: promote yourself to admin (replace the email), then re-run is fine.
--   update public.profiles set role = 'admin' where email = 'you@example.com';
-- ============================================================================
