-- ============================================================================
-- JUstep — case-insensitive unique usernames (010)
-- Ensure profiles.username exists, then enforce uniqueness across non-null
-- values case-insensitively, so "Qais" and "qais" collide but multiple NULLs
-- (users who haven't set one) are allowed.
-- ============================================================================

alter table public.profiles
  add column if not exists username text;

create unique index if not exists idx_profiles_username_lower
  on public.profiles (lower(username))
  where username is not null;
