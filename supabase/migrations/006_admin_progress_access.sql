-- ============================================================================
-- JUstep — admin read access to student progress (006)
-- Lets admins view any student's analytics in the Admin → User Management view.
-- Relies on is_admin() from migration 003.
-- ============================================================================

-- Admins can read every student's question progress.
drop policy if exists "user_progress_admin_read" on public.user_progress;
create policy "user_progress_admin_read"
  on public.user_progress for select
  to authenticated
  using (public.is_admin());

-- Admins can read every student's flashcard progress.
drop policy if exists "flashcard_progress_admin_read" on public.flashcard_progress;
create policy "flashcard_progress_admin_read"
  on public.flashcard_progress for select
  to authenticated
  using (public.is_admin());
