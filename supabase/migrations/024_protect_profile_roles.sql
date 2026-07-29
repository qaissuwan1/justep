-- ============================================================================
-- JUStep - protect profile role authorization (024)
--
-- Migration 001 lets authenticated users update their own profile row.
-- Migration 003 later added profiles.role and made public.is_admin() trust it.
-- Without a column-transition guard, a student can therefore promote their own
-- row to role = 'admin' through a direct table/REST update.
--
-- Keep the existing own-profile policy so safe fields such as username,
-- full_name, and avatar_url remain editable. Protect only role transitions.
-- ============================================================================

-- This trigger function runs with the privileges of the role performing the
-- UPDATE. A role change is accepted only for:
--   * an already-authorized JUStep admin;
--   * the postgres/Supabase trusted database roles.
-- A direct PostgREST table update therefore runs this function as
-- `authenticated`. An update issued inside public.set_profile_role() runs as
-- that SECURITY DEFINER function's owner only after the RPC authorizes the JWT
-- actor through auth.uid() / public.is_admin().
--
-- An UPDATE that includes role but leaves its value unchanged is allowed. This
-- keeps full-row updates compatible while preventing privilege escalation.
create or replace function public.guard_profile_role_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  if current_user in ('postgres', 'service_role', 'supabase_admin')
     or coalesce(public.is_admin(), false) then
    return new;
  end if;

  raise exception 'not authorized to change profile role'
    using errcode = '42501';
end;
$function$;

alter function public.guard_profile_role_update() owner to postgres;
revoke all on function public.guard_profile_role_update() from public;
revoke all on function public.guard_profile_role_update() from anon;
revoke all on function public.guard_profile_role_update() from authenticated;

drop trigger if exists profiles_guard_role_update on public.profiles;
create trigger profiles_guard_role_update
before update of role on public.profiles
for each row
execute function public.guard_profile_role_update();

-- There is currently no frontend role-management flow. Provide existing admins
-- one narrow database API for legitimate role management without granting them
-- broad UPDATE access to every column of every profile.
create or replace function public.set_profile_role(
  p_profile_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'not authorized to manage profile roles'
      using errcode = '42501';
  end if;

  if p_role is null
     or p_role not in ('student', 'instructor', 'admin') then
    raise exception 'invalid profile role'
      using errcode = '22023';
  end if;

  update public.profiles
  set role = p_role
  where id = p_profile_id;

  if not found then
    raise exception 'profile not found'
      using errcode = 'P0002';
  end if;
end;
$function$;

alter function public.set_profile_role(uuid, text) owner to postgres;
revoke all on function public.set_profile_role(uuid, text) from public;
revoke all on function public.set_profile_role(uuid, text) from anon;
revoke all on function public.set_profile_role(uuid, text) from authenticated;
grant execute on function public.set_profile_role(uuid, text) to authenticated;

-- Trusted postgres/service-role operations retain their existing direct table
-- path. The trigger explicitly allows those roles, while RLS and the guard deny
-- a normal authenticated student any role transition.
