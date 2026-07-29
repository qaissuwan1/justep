-- ============================================================================
-- JUStep - make question-attempt history append-only (025)
--
-- Migration 001 created user_progress_manage_own as a FOR ALL policy. That
-- allowed an authenticated student to update or delete their own historical
-- attempts through the table/Data API. Question attempts are event history:
-- students may append and read their own events, but may not rewrite or erase
-- them.
--
-- Trusted postgres ownership is unchanged. service_role receives an explicit
-- full table grant for trusted maintenance and account/data administration.
-- ============================================================================

alter table public.user_progress enable row level security;

-- Replace the legacy FOR ALL policy with operation-specific own-row policies.
drop policy if exists "user_progress_manage_own"
  on public.user_progress;
drop policy if exists "user_progress_select_own"
  on public.user_progress;
drop policy if exists "user_progress_insert_own"
  on public.user_progress;

create policy "user_progress_select_own"
  on public.user_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_progress_insert_own"
  on public.user_progress
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Preserve the existing admin-wide analytics read path from migration 006.
drop policy if exists "user_progress_admin_read"
  on public.user_progress;
create policy "user_progress_admin_read"
  on public.user_progress
  for select
  to authenticated
  using (public.is_admin());

-- Normalize table privileges as defense in depth. There are intentionally no
-- authenticated UPDATE or DELETE grants and no matching RLS policies.
revoke all on table public.user_progress from public;
revoke all on table public.user_progress from anon;
revoke all on table public.user_progress from authenticated;

grant select, insert
  on table public.user_progress
  to authenticated;

-- Preserve the trusted Supabase server-side maintenance path explicitly.
grant all privileges
  on table public.user_progress
  to service_role;
