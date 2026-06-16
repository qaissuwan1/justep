-- ============================================================================
-- JUstep — profile email privacy (011)
-- RLS can restrict ROWS but not COLUMNS, so "profiles_select_authenticated"
-- (using true) let every signed-in user read every column — including email.
-- We drop that policy (leaving admin-or-own-row as the only direct SELECT) and
-- expose a safe view with only public display columns for the leaderboard.
-- ============================================================================

-- 1. Remove the permissive read policy. After this, the only SELECT policy on
--    profiles is "profiles_admin_read" (migration 003): is_admin() OR own row.
--    => students can read only their OWN profile; admins can read all.
drop policy if exists "profiles_select_authenticated" on public.profiles;

-- 2. Safe public view — only non-sensitive display columns (NO email, no
--    streak/progress internals). The view is owned by the migration role
--    (postgres), and with security_invoker OFF it reads the underlying table
--    with the owner's rights, bypassing the restrictive row policy — but it can
--    still only ever expose these four columns.
create or replace view public.public_profiles as
  select id, full_name, username, avatar_url
  from public.profiles;

alter view public.public_profiles set (security_invoker = false);

-- 3. Authenticated users only (don't let the anon role read it).
revoke all on public.public_profiles from anon, public;
grant select on public.public_profiles to authenticated;
