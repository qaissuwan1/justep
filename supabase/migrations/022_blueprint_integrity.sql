-- ============================================================================
-- JUStep - Blueprint integrity layer (022)
--
-- Behavioral and cross-row integrity for the eight Blueprint tables created by
-- 021_blueprint_schema.sql. This migration adds no Blueprint content and does
-- not compute or persist EP.
--
-- Public entry points (and only public functions introduced here):
--   public.submit_blueprint_review(uuid)
--   public.return_blueprint_to_draft(uuid)
--   public.approve_blueprint(uuid)
--   public.create_successor_blueprint(uuid, text)
--
-- SQLSTATE map:
--   BP001 BP_NOT_ADMIN
--   BP002 BP_LIFECYCLE_DIRECT
--   BP003 BP_ILLEGAL_TRANSITION
--   BP004 BP_WRONG_STATE
--   BP005 BP_IMMUTABLE
--   BP006 BP_SOURCE_LOCKED
--   BP007 BP_HARD_DELETE
--   BP008 BP_CROSS_BLUEPRINT_LINK
--   BP009 BP_CROSS_LECTURE_LINK
--   BP010 BP_REVIEW_GATE
--   BP011 BP_APPROVAL_GATE
--   BP012 BP_CLW_CORRELATION_UNAVAILABLE
--   BP013 BP_SUCCESSOR_PRECONDITION
--   BP014 BP_SPEC_VERSION_REQUIRED
--   BP015 BP_CONCURRENT_APPROVAL
--   BP016 BP_ROOT_INSERT_INVALID
--   BP017 BP_ROOT_SUCCESSOR_DIRECT
--   BP018 BP_STRUCTURAL_IMMUTABLE
--   BP019 BP_OBJECTIVE_DECISION_SHAPE
--   BP020 BP_LINEAGE_INVALID
--   BP021 BP_ENDPOINT_IMMUTABLE
-- ============================================================================

-- ============================================================================
-- 1. Dedicated non-login RPC owner.
--
-- Roles are cluster-level and can survive database resets. Creation is guarded,
-- and every attribute is normalized on every application.
-- ============================================================================
do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'blueprint_rpc'
  ) then
    create role blueprint_rpc
      nosuperuser
      nologin
      noinherit
      nobypassrls
      nocreatedb
      nocreaterole
      noreplication;
  end if;
end
$migration$;

alter role blueprint_rpc
  nosuperuser
  nologin
  noinherit
  nobypassrls
  nocreatedb
  nocreaterole
  noreplication;

-- The trusted migration/table owner needs SET ROLE capability to create and
-- replace objects owned by blueprint_rpc on non-superuser deployments. PG16+
-- supports per-membership SET/INHERIT/ADMIN options. Older supported servers
-- receive the legacy, non-admin membership; postgres is already the trusted
-- migration identity in Supabase.
do $migration$
begin
  if exists (
    select 1 from pg_catalog.pg_roles where rolname = 'postgres'
  ) then
    if pg_catalog.current_setting('server_version_num')::pg_catalog.int4 >= 160000 then
      execute
        'grant blueprint_rpc to postgres with set true, inherit false, admin false';
    else
      revoke blueprint_rpc from postgres;
      grant blueprint_rpc to postgres;
    end if;
  end if;
end
$migration$;

-- No application-facing role may be a member of blueprint_rpc. Guard each
-- revoke because local test clusters do not always provision every Supabase
-- role.
do $migration$
declare
  v_role pg_catalog.text;
begin
  foreach v_role in array array[
    'anon',
    'authenticated',
    'authenticator',
    'service_role'
  ]::pg_catalog.text[]
  loop
    if exists (
      select 1 from pg_catalog.pg_roles where rolname = v_role
    ) then
      execute pg_catalog.format('revoke blueprint_rpc from %I', v_role);
    end if;
  end loop;
end
$migration$;

-- Direct revokes above are not sufficient if an application role reaches
-- blueprint_rpc through another role. Abort on any direct or indirect
-- membership path. BP001 is the existing authorization SQLSTATE/token.
do $migration$
declare
  v_role pg_catalog.text;
begin
  foreach v_role in array array[
    'anon',
    'authenticated',
    'authenticator',
    'service_role'
  ]::pg_catalog.text[]
  loop
    if exists (
      select 1 from pg_catalog.pg_roles where rolname = v_role
    ) then
      if pg_catalog.pg_has_role(v_role, 'blueprint_rpc', 'MEMBER') then
        raise exception using
          errcode = 'BP001',
          message = 'BP_NOT_ADMIN',
          detail = 'unsafe direct or indirect blueprint_rpc membership: ' || v_role;
      end if;
    end if;
  end loop;
end
$migration$;

-- ============================================================================
-- 2. Private implementation schema.
-- ============================================================================
create schema if not exists blueprint_internal;

revoke all on schema blueprint_internal from public;
revoke all on schema blueprint_internal from anon;
revoke all on schema blueprint_internal from authenticated;
revoke all on schema blueprint_internal from authenticator;
revoke all on schema blueprint_internal from service_role;

revoke create on schema public from blueprint_rpc;
grant usage on schema public to blueprint_rpc;
grant usage on schema blueprint_internal to blueprint_rpc;
revoke all on schema auth from blueprint_rpc;
grant usage on schema auth to blueprint_rpc;
revoke execute on all functions in schema auth from blueprint_rpc;
grant execute on function auth.uid() to blueprint_rpc;

-- Make the private schema owner match the Blueprint table owner. This avoids an
-- assumption that a particular migration runner name owns the tables.
do $migration$
declare
  v_owner pg_catalog.text;
begin
  select pg_catalog.pg_get_userbyid(c.relowner)
    into v_owner
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'blueprints'
    and c.relkind in ('r', 'p');

  if v_owner is not null then
    execute pg_catalog.format(
      'alter schema blueprint_internal owner to %I',
      v_owner
    );
  end if;
end
$migration$;

-- ============================================================================
-- 3. RLS bridge for the dedicated RPC owner.
--
-- Migration 021 policies are TO authenticated. blueprint_rpc is deliberately
-- not a member of authenticated, so it requires its own policies. Each policy
-- still evaluates the original request JWT through public.is_admin(). No DELETE
-- policy is created.
-- ============================================================================
drop policy if exists "blueprints_rpc_select" on public.blueprints;
create policy "blueprints_rpc_select"
  on public.blueprints for select to blueprint_rpc
  using (public.is_admin());
drop policy if exists "blueprints_rpc_insert" on public.blueprints;
create policy "blueprints_rpc_insert"
  on public.blueprints for insert to blueprint_rpc
  with check (public.is_admin());
drop policy if exists "blueprints_rpc_update" on public.blueprints;
create policy "blueprints_rpc_update"
  on public.blueprints for update to blueprint_rpc
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "learning_objectives_rpc_select" on public.learning_objectives;
create policy "learning_objectives_rpc_select"
  on public.learning_objectives for select to blueprint_rpc
  using (public.is_admin());
drop policy if exists "learning_objectives_rpc_insert" on public.learning_objectives;
create policy "learning_objectives_rpc_insert"
  on public.learning_objectives for insert to blueprint_rpc
  with check (public.is_admin());
drop policy if exists "learning_objectives_rpc_update" on public.learning_objectives;
create policy "learning_objectives_rpc_update"
  on public.learning_objectives for update to blueprint_rpc
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "concepts_rpc_select" on public.concepts;
create policy "concepts_rpc_select"
  on public.concepts for select to blueprint_rpc
  using (public.is_admin());
drop policy if exists "concepts_rpc_insert" on public.concepts;
create policy "concepts_rpc_insert"
  on public.concepts for insert to blueprint_rpc
  with check (public.is_admin());
drop policy if exists "concepts_rpc_update" on public.concepts;
create policy "concepts_rpc_update"
  on public.concepts for update to blueprint_rpc
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "concept_weights_rpc_select" on public.concept_weights;
create policy "concept_weights_rpc_select"
  on public.concept_weights for select to blueprint_rpc
  using (public.is_admin());
drop policy if exists "concept_weights_rpc_insert" on public.concept_weights;
create policy "concept_weights_rpc_insert"
  on public.concept_weights for insert to blueprint_rpc
  with check (public.is_admin());
drop policy if exists "concept_weights_rpc_update" on public.concept_weights;
create policy "concept_weights_rpc_update"
  on public.concept_weights for update to blueprint_rpc
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "source_references_rpc_select" on public.source_references;
create policy "source_references_rpc_select"
  on public.source_references for select to blueprint_rpc
  using (public.is_admin());
drop policy if exists "source_references_rpc_insert" on public.source_references;
create policy "source_references_rpc_insert"
  on public.source_references for insert to blueprint_rpc
  with check (public.is_admin());
drop policy if exists "source_references_rpc_update" on public.source_references;
create policy "source_references_rpc_update"
  on public.source_references for update to blueprint_rpc
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "concept_objectives_rpc_select" on public.concept_objectives;
create policy "concept_objectives_rpc_select"
  on public.concept_objectives for select to blueprint_rpc
  using (public.is_admin());
drop policy if exists "concept_objectives_rpc_insert" on public.concept_objectives;
create policy "concept_objectives_rpc_insert"
  on public.concept_objectives for insert to blueprint_rpc
  with check (public.is_admin());
drop policy if exists "concept_objectives_rpc_update" on public.concept_objectives;
create policy "concept_objectives_rpc_update"
  on public.concept_objectives for update to blueprint_rpc
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lo_source_refs_rpc_select"
  on public.learning_objective_source_references;
create policy "lo_source_refs_rpc_select"
  on public.learning_objective_source_references for select to blueprint_rpc
  using (public.is_admin());
drop policy if exists "lo_source_refs_rpc_insert"
  on public.learning_objective_source_references;
create policy "lo_source_refs_rpc_insert"
  on public.learning_objective_source_references for insert to blueprint_rpc
  with check (public.is_admin());
drop policy if exists "lo_source_refs_rpc_update"
  on public.learning_objective_source_references;
create policy "lo_source_refs_rpc_update"
  on public.learning_objective_source_references for update to blueprint_rpc
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "concept_source_refs_rpc_select"
  on public.concept_source_references;
create policy "concept_source_refs_rpc_select"
  on public.concept_source_references for select to blueprint_rpc
  using (public.is_admin());
drop policy if exists "concept_source_refs_rpc_insert"
  on public.concept_source_references;
create policy "concept_source_refs_rpc_insert"
  on public.concept_source_references for insert to blueprint_rpc
  with check (public.is_admin());
drop policy if exists "concept_source_refs_rpc_update"
  on public.concept_source_references;
create policy "concept_source_refs_rpc_update"
  on public.concept_source_references for update to blueprint_rpc
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 4. Internal trusted read helpers.
-- ============================================================================
create or replace function blueprint_internal.blueprint_root_status(
  p_blueprint_id pg_catalog.uuid
)
returns pg_catalog.text
language sql
stable
security definer
set search_path = ''
as $function$
  select b.lifecycle_status
  from public.blueprints as b
  where b.id = p_blueprint_id
$function$;

create or replace function blueprint_internal.blueprint_owner_lecture(
  p_blueprint_id pg_catalog.uuid
)
returns pg_catalog.uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select b.lecture_id
  from public.blueprints as b
  where b.id = p_blueprint_id
$function$;

create or replace function blueprint_internal.blueprint_review_gate_tokens(
  p_blueprint_id pg_catalog.uuid
)
returns pg_catalog.text[]
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tokens pg_catalog.text[] := array[]::pg_catalog.text[];
  v_id pg_catalog.uuid;
begin
  if not exists (
    select 1
    from public.concepts as c
    where c.blueprint_id = p_blueprint_id
      and c.deleted_at is null
  ) then
    v_tokens := pg_catalog.array_append(v_tokens, 'NO_LIVE_CONCEPT');
  end if;

  if not exists (
    select 1
    from public.learning_objectives as o
    where o.blueprint_id = p_blueprint_id
      and o.deleted_at is null
      and o.confirmation_status = 'confirmed'
      and o.origin in ('declared', 'derived')
  ) then
    v_tokens := pg_catalog.array_append(v_tokens, 'NO_ACTIVE_OBJECTIVE');
  end if;

  for v_id in
    select o.id
    from public.learning_objectives as o
    where o.blueprint_id = p_blueprint_id
      and o.deleted_at is null
      and o.origin = 'derived'
      and o.confirmation_status = 'pending'
    order by o.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'DERIVED_PENDING:' || v_id::pg_catalog.text
    );
  end loop;

  for v_id in
    select o.id
    from public.learning_objectives as o
    where o.blueprint_id = p_blueprint_id
      and o.deleted_at is null
      and o.origin = 'declared'
      and o.confirmation_status <> 'confirmed'
    order by o.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'DECLARED_NOT_CONFIRMED:' || v_id::pg_catalog.text
    );
  end loop;

  for v_id in
    select co.id
    from public.concept_objectives as co
    join public.concepts as c on c.id = co.concept_id
    join public.learning_objectives as o on o.id = co.objective_id
    where co.deleted_at is null
      and c.blueprint_id = p_blueprint_id
      and (
        o.deleted_at is not null
        or o.confirmation_status <> 'confirmed'
        or o.origin not in ('declared', 'derived')
      )
    order by co.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'LINK_TO_INACTIVE_OBJECTIVE:' || v_id::pg_catalog.text
    );
  end loop;

  for v_id in
    select c.id
    from public.concepts as c
    left join public.concept_weights as w
      on w.concept_id = c.id
     and w.deleted_at is null
    where c.blueprint_id = p_blueprint_id
      and c.deleted_at is null
      and (
        w.id is null
        or w.cw_state = 'pending'
        or w.clw_state = 'pending'
        or w.sw_state = 'pending'
      )
    order by c.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'WEIGHT_PENDING:' || v_id::pg_catalog.text
    );
  end loop;

  for v_id in
    select c.id
    from public.concepts as c
    where c.blueprint_id = p_blueprint_id
      and c.deleted_at is null
      and not exists (
        select 1
        from public.concept_source_references as csr
        join public.source_references as sr
          on sr.id = csr.source_reference_id
         and sr.deleted_at is null
        where csr.concept_id = c.id
          and csr.deleted_at is null
      )
    order by c.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'CONCEPT_NO_SOURCE:' || v_id::pg_catalog.text
    );
  end loop;

  for v_id in
    select o.id
    from public.learning_objectives as o
    where o.blueprint_id = p_blueprint_id
      and o.deleted_at is null
      and o.confirmation_status = 'confirmed'
      and o.origin in ('declared', 'derived')
      and not exists (
        select 1
        from public.learning_objective_source_references as osr
        join public.source_references as sr
          on sr.id = osr.source_reference_id
         and sr.deleted_at is null
        where osr.objective_id = o.id
          and osr.deleted_at is null
      )
    order by o.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'OBJECTIVE_NO_SOURCE:' || v_id::pg_catalog.text
    );
  end loop;

  for v_id in
    select c.id
    from public.concepts as c
    where c.blueprint_id = p_blueprint_id
      and c.deleted_at is null
      and not exists (
        select 1
        from public.concept_objectives as co
        join public.learning_objectives as o
          on o.id = co.objective_id
         and o.deleted_at is null
         and o.confirmation_status = 'confirmed'
         and o.origin in ('declared', 'derived')
        where co.concept_id = c.id
          and co.deleted_at is null
      )
    order by c.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'CONCEPT_UNCOVERED:' || v_id::pg_catalog.text
    );
  end loop;

  for v_id in
    select o.id
    from public.learning_objectives as o
    where o.blueprint_id = p_blueprint_id
      and o.deleted_at is null
      and o.confirmation_status = 'confirmed'
      and o.origin in ('declared', 'derived')
      and not exists (
        select 1
        from public.concept_objectives as co
        join public.concepts as c
          on c.id = co.concept_id
         and c.deleted_at is null
        where co.objective_id = o.id
          and co.deleted_at is null
      )
    order by o.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'OBJECTIVE_UNCOVERED:' || v_id::pg_catalog.text
    );
  end loop;

  -- Live Concept-Objective rows must have live endpoints in one Blueprint.
  for v_id in
    select co.id
    from public.concept_objectives as co
    left join public.concepts as c on c.id = co.concept_id
    left join public.learning_objectives as o on o.id = co.objective_id
    where co.deleted_at is null
      and (
        c.blueprint_id = p_blueprint_id
        or o.blueprint_id = p_blueprint_id
      )
      and (
        c.id is null
        or o.id is null
        or c.deleted_at is not null
        or o.deleted_at is not null
        or c.blueprint_id <> o.blueprint_id
      )
    order by co.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'DEAD_LINK_PARTICIPANT:' || v_id::pg_catalog.text
    );
  end loop;

  -- Live Objective-Source rows must have live, lecture-matched endpoints.
  for v_id in
    select osr.id
    from public.learning_objective_source_references as osr
    left join public.learning_objectives as o on o.id = osr.objective_id
    left join public.source_references as sr
      on sr.id = osr.source_reference_id
    where osr.deleted_at is null
      and o.blueprint_id = p_blueprint_id
      and (
        o.id is null
        or sr.id is null
        or o.deleted_at is not null
        or sr.deleted_at is not null
        or o.lecture_id <> sr.lecture_id
      )
    order by osr.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'DEAD_LINK_PARTICIPANT:' || v_id::pg_catalog.text
    );
  end loop;

  -- Live Concept-Source rows must have live, lecture-matched endpoints.
  for v_id in
    select csr.id
    from public.concept_source_references as csr
    left join public.concepts as c on c.id = csr.concept_id
    left join public.source_references as sr
      on sr.id = csr.source_reference_id
    where csr.deleted_at is null
      and c.blueprint_id = p_blueprint_id
      and (
        c.id is null
        or sr.id is null
        or c.deleted_at is not null
        or sr.deleted_at is not null
        or c.lecture_id <> sr.lecture_id
      )
    order by csr.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'DEAD_LINK_PARTICIPANT:' || v_id::pg_catalog.text
    );
  end loop;

  return v_tokens;
end
$function$;

-- ============================================================================
-- 5. Hard-delete trigger functions. Each Blueprint table has an independent,
-- unconditional BEFORE DELETE guard.
-- ============================================================================
create or replace function blueprint_internal.trg_blueprints_no_hard_delete()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = 'BP007',
    message = 'BP_HARD_DELETE',
    detail = 'table=public.blueprints';
end
$function$;

create or replace function blueprint_internal.trg_learning_objectives_no_hard_delete()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = 'BP007',
    message = 'BP_HARD_DELETE',
    detail = 'table=public.learning_objectives';
end
$function$;

create or replace function blueprint_internal.trg_concepts_no_hard_delete()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = 'BP007',
    message = 'BP_HARD_DELETE',
    detail = 'table=public.concepts';
end
$function$;

create or replace function blueprint_internal.trg_concept_weights_no_hard_delete()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = 'BP007',
    message = 'BP_HARD_DELETE',
    detail = 'table=public.concept_weights';
end
$function$;

create or replace function blueprint_internal.trg_source_references_no_hard_delete()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = 'BP007',
    message = 'BP_HARD_DELETE',
    detail = 'table=public.source_references';
end
$function$;

create or replace function blueprint_internal.trg_concept_objectives_no_hard_delete()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = 'BP007',
    message = 'BP_HARD_DELETE',
    detail = 'table=public.concept_objectives';
end
$function$;

create or replace function blueprint_internal.trg_lo_source_refs_no_hard_delete()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = 'BP007',
    message = 'BP_HARD_DELETE',
    detail = 'table=public.learning_objective_source_references';
end
$function$;

create or replace function blueprint_internal.trg_concept_source_refs_no_hard_delete()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = 'BP007',
    message = 'BP_HARD_DELETE',
    detail = 'table=public.concept_source_references';
end
$function$;

-- ============================================================================
-- 6. Root lifecycle / identity trigger. SECURITY INVOKER is intentional:
-- current_user must be the dedicated RPC owner for lifecycle writes.
-- ============================================================================
create or replace function blueprint_internal.trg_blueprints_biu()
returns pg_catalog.trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_tokens pg_catalog.text[];
begin
  if tg_op = 'INSERT' then
    if new.supersedes_id = new.id then
      raise exception using
        errcode = 'BP020',
        message = 'BP_LINEAGE_INVALID',
        detail = 'supersedes_id must differ from id';
    end if;

    if current_user <> 'blueprint_rpc' then
      if new.version > 1 or new.supersedes_id is not null then
        raise exception using
          errcode = 'BP017',
          message = 'BP_ROOT_SUCCESSOR_DIRECT',
          detail = 'successor roots require create_successor_blueprint';
      end if;

      if new.lifecycle_status <> 'draft'
         or new.version <> 1
         or new.supersedes_id is not null
         or new.reviewed_by is not null
         or new.reviewed_at is not null
         or new.approved_by is not null
         or new.approved_at is not null
         or new.frozen_at is not null
         or new.deleted_at is not null
         or new.producer_class is null
         or new.produced_at is null
         or new.spec_version is null
         or pg_catalog.btrim(new.spec_version) = ''
         or new.created_by is null then
        raise exception using
          errcode = 'BP016',
          message = 'BP_ROOT_INSERT_INVALID',
          detail = 'initial root must be a live unstamped version-1 draft with provenance';
      end if;
    else
      if new.lifecycle_status <> 'draft'
         or new.version <= 1
         or new.supersedes_id is null
         or new.reviewed_by is not null
         or new.reviewed_at is not null
         or new.approved_by is not null
         or new.approved_at is not null
         or new.frozen_at is not null
         or new.deleted_at is not null
         or new.producer_class is null
         or new.produced_at is null
         or new.spec_version is null
         or pg_catalog.btrim(new.spec_version) = ''
         or new.created_by is null then
        raise exception using
          errcode = 'BP016',
          message = 'BP_ROOT_INSERT_INVALID',
          detail = 'successor root shape is invalid';
      end if;
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
     or new.lecture_id is distinct from old.lecture_id
     or new.version is distinct from old.version
     or new.supersedes_id is distinct from old.supersedes_id
     or new.producer_class is distinct from old.producer_class
     or new.produced_at is distinct from old.produced_at
     or new.spec_version is distinct from old.spec_version
     or new.created_by is distinct from old.created_by then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'root identity and X-7 provenance cannot change';
  end if;

  if new.lifecycle_status is distinct from old.lifecycle_status then
    if current_user <> 'blueprint_rpc' then
      raise exception using
        errcode = 'BP002',
        message = 'BP_LIFECYCLE_DIRECT',
        detail = 'lifecycle changes require a Blueprint RPC';
    end if;

    if old.deleted_at is not null or new.deleted_at is not null then
      raise exception using
        errcode = 'BP003',
        message = 'BP_ILLEGAL_TRANSITION',
        detail = 'a soft-deleted root cannot transition';
    end if;

    if not (
      (old.lifecycle_status = 'draft' and new.lifecycle_status = 'reviewed')
      or (old.lifecycle_status = 'reviewed' and new.lifecycle_status = 'draft')
      or (old.lifecycle_status = 'reviewed' and new.lifecycle_status = 'approved')
      or (old.lifecycle_status = 'approved' and new.lifecycle_status = 'retired')
    ) then
      raise exception using
        errcode = 'BP003',
        message = 'BP_ILLEGAL_TRANSITION',
        detail = old.lifecycle_status || ' -> ' || new.lifecycle_status;
    end if;

    if old.lifecycle_status = 'draft' and new.lifecycle_status = 'reviewed' then
      if new.reviewed_by is null
         or new.reviewed_at is null
         or new.approved_by is not null
         or new.approved_at is not null
         or new.frozen_at is not null
         or new.deleted_at is distinct from old.deleted_at then
        raise exception using
          errcode = 'BP003',
          message = 'BP_ILLEGAL_TRANSITION',
          detail = 'draft -> reviewed stamp shape is invalid';
      end if;

      v_tokens :=
        blueprint_internal.blueprint_review_gate_tokens(old.id);
      if pg_catalog.cardinality(v_tokens) > 0 then
        raise exception using
          errcode = 'BP010',
          message = 'BP_REVIEW_GATE',
          detail = pg_catalog.array_to_string(v_tokens, ',');
      end if;
    elsif old.lifecycle_status = 'reviewed'
          and new.lifecycle_status = 'draft' then
      if new.reviewed_by is not null
         or new.reviewed_at is not null
         or new.approved_by is not null
         or new.approved_at is not null
         or new.frozen_at is not null
         or new.deleted_at is distinct from old.deleted_at then
        raise exception using
          errcode = 'BP003',
          message = 'BP_ILLEGAL_TRANSITION',
          detail = 'reviewed -> draft stamp shape is invalid';
      end if;
    elsif old.lifecycle_status = 'reviewed'
          and new.lifecycle_status = 'approved' then
      if new.reviewed_by is distinct from old.reviewed_by
         or new.reviewed_at is distinct from old.reviewed_at
         or new.approved_by is null
         or new.approved_at is null
         or new.frozen_at is null
         or new.deleted_at is distinct from old.deleted_at then
        raise exception using
          errcode = 'BP003',
          message = 'BP_ILLEGAL_TRANSITION',
          detail = 'reviewed -> approved stamp shape is invalid';
      end if;

      if exists (
        select 1
        from public.concept_weights as w
        join public.concepts as c on c.id = w.concept_id
        where c.blueprint_id = old.id
          and c.deleted_at is null
          and w.deleted_at is null
          and w.clw_state = 'assigned'
          and w.clw_value >= 2
      ) then
        raise exception using
          errcode = 'BP012',
          message = 'BP_CLW_CORRELATION_UNAVAILABLE',
          detail = 'assigned CLW >= 2 requires an attached Clinical Correlation, unavailable in Slice 1';
      end if;

      v_tokens :=
        blueprint_internal.blueprint_approval_gate_tokens(old.id);
      if pg_catalog.cardinality(v_tokens) > 0 then
        raise exception using
          errcode = 'BP011',
          message = 'BP_APPROVAL_GATE',
          detail = pg_catalog.array_to_string(v_tokens, ',');
      end if;
    elsif old.lifecycle_status = 'approved'
          and new.lifecycle_status = 'retired' then
      if new.reviewed_by is distinct from old.reviewed_by
         or new.reviewed_at is distinct from old.reviewed_at
         or new.approved_by is distinct from old.approved_by
         or new.approved_at is distinct from old.approved_at
         or new.frozen_at is distinct from old.frozen_at
         or new.deleted_at is distinct from old.deleted_at then
        raise exception using
          errcode = 'BP003',
          message = 'BP_ILLEGAL_TRANSITION',
          detail = 'approved -> retired may change lifecycle_status only';
      end if;
    end if;

    return new;
  end if;

  if old.lifecycle_status in ('reviewed', 'approved', 'retired')
     and new is distinct from old then
    raise exception using
      errcode = 'BP005',
      message = 'BP_IMMUTABLE',
      detail = 'reviewed, approved, and retired roots are frozen';
  end if;

  -- A draft root has no authoring fields beyond its soft-delete marker.
  if old.lifecycle_status = 'draft'
     and (
       new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.frozen_at is distinct from old.frozen_at
     ) then
    raise exception using
      errcode = 'BP005',
      message = 'BP_IMMUTABLE',
      detail = 'draft review and approval stamps are RPC-controlled';
  end if;

  return new;
end
$function$;

-- ============================================================================
-- 7. Child and relationship guards.
-- ============================================================================
create or replace function blueprint_internal.trg_lobjectives_guard()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_blueprint_id pg_catalog.uuid;
  v_status pg_catalog.text;
  v_lecture_id pg_catalog.uuid;
  v_root_deleted_at pg_catalog.timestamptz;
begin
  v_blueprint_id :=
    case when tg_op = 'INSERT' then new.blueprint_id else old.blueprint_id end;

  select b.lifecycle_status, b.lecture_id, b.deleted_at
    into v_status, v_lecture_id, v_root_deleted_at
  from public.blueprints as b
  where b.id = v_blueprint_id
  for share of b;

  if v_status is null
     or v_status <> 'draft'
     or v_root_deleted_at is not null then
    raise exception using
      errcode = 'BP005',
      message = 'BP_IMMUTABLE',
      detail = 'learning objectives are editable only on a live draft';
  end if;

  if new.lecture_id <> v_lecture_id then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'objective lecture_id must match its Blueprint';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.blueprint_id is distinct from old.blueprint_id
    or new.lecture_id is distinct from old.lecture_id
    or new.origin is distinct from old.origin
    or new.producer_class is distinct from old.producer_class
    or new.produced_at is distinct from old.produced_at
    or new.spec_version is distinct from old.spec_version
    or new.created_by is distinct from old.created_by
  ) then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'objective identity, origin, and X-7 provenance cannot change';
  end if;

  if tg_op = 'UPDATE'
     and old.origin = 'declared'
     and new.text is distinct from old.text then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'declared objective text is immutable';
  end if;

  if new.created_by is null
     or new.produced_at is null
     or new.spec_version is null
     or pg_catalog.btrim(new.spec_version) = '' then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'objective X-7 provenance is required';
  end if;

  if (
    new.origin = 'declared'
    and new.confirmation_status <> 'confirmed'
  ) or (
    new.origin = 'derived'
    and new.confirmation_status = 'pending'
    and (new.decided_by is not null or new.decided_at is not null)
  ) or (
    new.origin = 'derived'
    and new.confirmation_status in ('confirmed', 'rejected')
    and (new.decided_by is null or new.decided_at is null)
  ) then
    raise exception using
      errcode = 'BP019',
      message = 'BP_OBJECTIVE_DECISION_SHAPE',
      detail = 'objective origin, confirmation status, and decision stamps disagree';
  end if;

  return new;
end
$function$;

create or replace function blueprint_internal.trg_concepts_guard()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_blueprint_id pg_catalog.uuid;
  v_status pg_catalog.text;
  v_lecture_id pg_catalog.uuid;
  v_root_deleted_at pg_catalog.timestamptz;
begin
  v_blueprint_id :=
    case when tg_op = 'INSERT' then new.blueprint_id else old.blueprint_id end;

  select b.lifecycle_status, b.lecture_id, b.deleted_at
    into v_status, v_lecture_id, v_root_deleted_at
  from public.blueprints as b
  where b.id = v_blueprint_id
  for share of b;

  if v_status is null
     or v_status <> 'draft'
     or v_root_deleted_at is not null then
    raise exception using
      errcode = 'BP005',
      message = 'BP_IMMUTABLE',
      detail = 'concepts are editable only on a live draft';
  end if;

  if new.lecture_id <> v_lecture_id then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'concept lecture_id must match its Blueprint';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.blueprint_id is distinct from old.blueprint_id
    or new.lecture_id is distinct from old.lecture_id
    or new.producer_class is distinct from old.producer_class
    or new.produced_at is distinct from old.produced_at
    or new.spec_version is distinct from old.spec_version
    or new.created_by is distinct from old.created_by
  ) then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'concept identity and X-7 provenance cannot change';
  end if;

  if new.created_by is null
     or new.produced_at is null
     or new.spec_version is null
     or pg_catalog.btrim(new.spec_version) = '' then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'concept X-7 provenance is required';
  end if;

  return new;
end
$function$;

create or replace function blueprint_internal.trg_weights_guard()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_blueprint_id pg_catalog.uuid;
  v_status pg_catalog.text;
  v_root_deleted_at pg_catalog.timestamptz;
  v_blueprint_version pg_catalog.int4;
begin
  select c.blueprint_id
    into v_blueprint_id
  from public.concepts as c
  where c.id =
    case when tg_op = 'INSERT' then new.concept_id else old.concept_id end;

  select b.lifecycle_status, b.deleted_at, b.version
    into v_status, v_root_deleted_at, v_blueprint_version
  from public.blueprints as b
  where b.id = v_blueprint_id
  for share of b;

  if v_status is null
     or v_status <> 'draft'
     or v_root_deleted_at is not null then
    raise exception using
      errcode = 'BP005',
      message = 'BP_IMMUTABLE',
      detail = 'concept weights are editable only on a live draft';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.concept_id is distinct from old.concept_id
    or new.producer_class is distinct from old.producer_class
    or new.produced_at is distinct from old.produced_at
    or new.spec_version is distinct from old.spec_version
    or new.created_by is distinct from old.created_by
  ) then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'weight identity and X-7 provenance cannot change';
  end if;

  if new.created_by is null
     or new.produced_at is null
     or new.spec_version is null
     or pg_catalog.btrim(new.spec_version) = '' then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'weight X-7 provenance is required';
  end if;

  if new.sw_state = 'assigned'
     and new.sw_blueprint_version is distinct from v_blueprint_version then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'assigned SW sw_blueprint_version must match owning Blueprint version';
  end if;

  return new;
end
$function$;

create or replace function blueprint_internal.trg_source_refs_guard()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_blueprint_id pg_catalog.uuid;
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.lecture_id is distinct from old.lecture_id
    or new.producer_class is distinct from old.producer_class
    or new.produced_at is distinct from old.produced_at
    or new.spec_version is distinct from old.spec_version
    or new.created_by is distinct from old.created_by
  ) then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'source identity and X-7 provenance cannot change';
  end if;

  if new.created_by is null
     or new.produced_at is null
     or new.spec_version is null
     or pg_catalog.btrim(new.spec_version) = '' then
    raise exception using
      errcode = 'BP018',
      message = 'BP_STRUCTURAL_IMMUTABLE',
      detail = 'source X-7 provenance is required';
  end if;

  if tg_op = 'UPDATE' and new is distinct from old then
    -- A source can be shared by multiple Blueprint roots. Lock every currently
    -- live dependent root in deterministic UUID order. These FOR SHARE locks
    -- conflict with lifecycle RPC FOR UPDATE locks and remain held to commit.
    for v_blueprint_id in
      select roots.blueprint_id
      from (
        select b.id as blueprint_id
        from public.learning_objective_source_references as osr
        join public.learning_objectives as o on o.id = osr.objective_id
        join public.blueprints as b
          on b.id = o.blueprint_id
         and b.deleted_at is null
        where osr.source_reference_id = old.id
          and osr.deleted_at is null
        union
        select b.id as blueprint_id
        from public.concept_source_references as csr
        join public.concepts as c on c.id = csr.concept_id
        join public.blueprints as b
          on b.id = c.blueprint_id
         and b.deleted_at is null
        where csr.source_reference_id = old.id
          and csr.deleted_at is null
      ) as roots
      order by roots.blueprint_id
    loop
      perform b.id
      from public.blueprints as b
      where b.id = v_blueprint_id
      for share of b;
    end loop;

    -- Re-run the dependency test after every root lock has been acquired. If a
    -- review/approval committed first, the refreshed status rejects this write.
    if exists (
      select 1
      from public.learning_objective_source_references as osr
      join public.learning_objectives as o on o.id = osr.objective_id
      join public.blueprints as b on b.id = o.blueprint_id
      where osr.source_reference_id = old.id
        and osr.deleted_at is null
        and b.deleted_at is null
        and b.lifecycle_status in ('reviewed', 'approved', 'retired')
    ) or exists (
      select 1
      from public.concept_source_references as csr
      join public.concepts as c on c.id = csr.concept_id
      join public.blueprints as b on b.id = c.blueprint_id
      where csr.source_reference_id = old.id
        and csr.deleted_at is null
        and b.deleted_at is null
        and b.lifecycle_status in ('reviewed', 'approved', 'retired')
    ) then
      raise exception using
        errcode = 'BP006',
        message = 'BP_SOURCE_LOCKED',
        detail = 'a non-draft Blueprint has a live dependency on this source';
    end if;
  end if;

  return new;
end
$function$;

create or replace function blueprint_internal.blueprint_approval_gate_tokens(
  p_blueprint_id pg_catalog.uuid
)
returns pg_catalog.text[]
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tokens pg_catalog.text[];
  v_id pg_catalog.uuid;
begin
  v_tokens :=
    blueprint_internal.blueprint_review_gate_tokens(p_blueprint_id);

  for v_id in
    select c.id
    from public.concepts as c
    left join public.concept_weights as w
      on w.concept_id = c.id
     and w.deleted_at is null
    where c.blueprint_id = p_blueprint_id
      and c.deleted_at is null
      and (w.id is null or w.cw_state <> 'assigned')
    order by c.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'CW_NOT_ASSIGNED:' || v_id::pg_catalog.text
    );
  end loop;

  for v_id in
    select c.id
    from public.concepts as c
    left join public.concept_weights as w
      on w.concept_id = c.id
     and w.deleted_at is null
    where c.blueprint_id = p_blueprint_id
      and c.deleted_at is null
      and (w.id is null or w.sw_state <> 'assigned')
    order by c.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'SW_NOT_ASSIGNED:' || v_id::pg_catalog.text
    );
  end loop;

  for v_id in
    select c.id
    from public.concepts as c
    left join public.concept_weights as w
      on w.concept_id = c.id
     and w.deleted_at is null
    where c.blueprint_id = p_blueprint_id
      and c.deleted_at is null
      and (
        w.id is null
        or w.clw_state not in ('assigned', 'not_assessable')
      )
    order by c.id
  loop
    v_tokens := pg_catalog.array_append(
      v_tokens,
      'CLW_NOT_TERMINAL:' || v_id::pg_catalog.text
    );
  end loop;

  return v_tokens;
end
$function$;

create or replace function blueprint_internal.trg_concept_objectives_guard()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_blueprint_id pg_catalog.uuid;
  v_status pg_catalog.text;
  v_root_deleted_at pg_catalog.timestamptz;
  v_concept_blueprint_id pg_catalog.uuid;
  v_objective_blueprint_id pg_catalog.uuid;
  v_concept_deleted_at pg_catalog.timestamptz;
  v_objective_deleted_at pg_catalog.timestamptz;
begin
  select c.blueprint_id
    into v_blueprint_id
  from public.concepts as c
  where c.id = case when tg_op = 'INSERT' then new.concept_id else old.concept_id end;

  select b.lifecycle_status, b.deleted_at
    into v_status, v_root_deleted_at
  from public.blueprints as b
  where b.id = v_blueprint_id
  for share of b;

  if v_status is null
     or v_status <> 'draft'
     or v_root_deleted_at is not null then
    raise exception using
      errcode = 'BP005',
      message = 'BP_IMMUTABLE',
      detail = 'Concept-Objective links are editable only on a live draft';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.concept_id is distinct from old.concept_id
    or new.objective_id is distinct from old.objective_id
    or new.producer_class is distinct from old.producer_class
    or new.produced_at is distinct from old.produced_at
    or new.spec_version is distinct from old.spec_version
    or new.created_by is distinct from old.created_by
  ) then
    raise exception using
      errcode = 'BP021',
      message = 'BP_ENDPOINT_IMMUTABLE',
      detail = 'relationship endpoints and X-7 provenance cannot change';
  end if;

  if new.created_by is null
     or new.produced_at is null
     or new.spec_version is null
     or pg_catalog.btrim(new.spec_version) = '' then
    raise exception using
      errcode = 'BP021',
      message = 'BP_ENDPOINT_IMMUTABLE',
      detail = 'relationship X-7 provenance is required';
  end if;

  if new.deleted_at is null then
    select c.blueprint_id, c.deleted_at
      into v_concept_blueprint_id, v_concept_deleted_at
    from public.concepts as c
    where c.id = new.concept_id;

    select o.blueprint_id, o.deleted_at
      into v_objective_blueprint_id, v_objective_deleted_at
    from public.learning_objectives as o
    where o.id = new.objective_id;

    if v_concept_blueprint_id is null
       or v_objective_blueprint_id is null
       or v_concept_deleted_at is not null
       or v_objective_deleted_at is not null
       or v_concept_blueprint_id <> v_objective_blueprint_id then
      raise exception using
        errcode = 'BP008',
        message = 'BP_CROSS_BLUEPRINT_LINK',
        detail = 'live Concept-Objective links require live endpoints in one Blueprint';
    end if;
  end if;

  return new;
end
$function$;

create or replace function blueprint_internal.trg_lo_source_refs_guard()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_reference_id pg_catalog.uuid;
  v_blueprint_id pg_catalog.uuid;
  v_status pg_catalog.text;
  v_root_deleted_at pg_catalog.timestamptz;
  v_objective_lecture_id pg_catalog.uuid;
  v_source_lecture_id pg_catalog.uuid;
  v_objective_deleted_at pg_catalog.timestamptz;
  v_source_deleted_at pg_catalog.timestamptz;
begin
  v_source_reference_id :=
    case when tg_op = 'INSERT' then new.source_reference_id else old.source_reference_id end;

  select sr.lecture_id, sr.deleted_at
    into v_source_lecture_id, v_source_deleted_at
  from public.source_references as sr
  where sr.id = v_source_reference_id
  for share of sr;

  if not found or v_source_deleted_at is not null then
    raise exception using
      errcode = 'BP009',
      message = 'BP_CROSS_LECTURE_LINK',
      detail = 'Objective-Source operations require an existing live source reference';
  end if;

  select o.blueprint_id, o.lecture_id, o.deleted_at
    into v_blueprint_id, v_objective_lecture_id, v_objective_deleted_at
  from public.learning_objectives as o
  where o.id = case when tg_op = 'INSERT' then new.objective_id else old.objective_id end;

  select b.lifecycle_status, b.deleted_at
    into v_status, v_root_deleted_at
  from public.blueprints as b
  where b.id = v_blueprint_id
  for share of b;

  if v_status is null
     or v_status <> 'draft'
     or v_root_deleted_at is not null then
    raise exception using
      errcode = 'BP005',
      message = 'BP_IMMUTABLE',
      detail = 'Objective-Source links are editable only on a live draft';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.objective_id is distinct from old.objective_id
    or new.source_reference_id is distinct from old.source_reference_id
    or new.producer_class is distinct from old.producer_class
    or new.produced_at is distinct from old.produced_at
    or new.spec_version is distinct from old.spec_version
    or new.created_by is distinct from old.created_by
  ) then
    raise exception using
      errcode = 'BP021',
      message = 'BP_ENDPOINT_IMMUTABLE',
      detail = 'relationship endpoints and X-7 provenance cannot change';
  end if;

  if new.created_by is null
     or new.produced_at is null
     or new.spec_version is null
     or pg_catalog.btrim(new.spec_version) = '' then
    raise exception using
      errcode = 'BP021',
      message = 'BP_ENDPOINT_IMMUTABLE',
      detail = 'relationship X-7 provenance is required';
  end if;

  if new.deleted_at is null then
    if v_objective_lecture_id is null
       or v_objective_deleted_at is not null
       or v_objective_lecture_id <> v_source_lecture_id then
      raise exception using
        errcode = 'BP009',
        message = 'BP_CROSS_LECTURE_LINK',
        detail = 'live Objective-Source links require live endpoints in one lecture';
    end if;
  end if;

  return new;
end
$function$;

create or replace function blueprint_internal.trg_concept_source_refs_guard()
returns pg_catalog.trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_reference_id pg_catalog.uuid;
  v_blueprint_id pg_catalog.uuid;
  v_status pg_catalog.text;
  v_root_deleted_at pg_catalog.timestamptz;
  v_concept_lecture_id pg_catalog.uuid;
  v_source_lecture_id pg_catalog.uuid;
  v_concept_deleted_at pg_catalog.timestamptz;
  v_source_deleted_at pg_catalog.timestamptz;
begin
  v_source_reference_id :=
    case when tg_op = 'INSERT' then new.source_reference_id else old.source_reference_id end;

  select sr.lecture_id, sr.deleted_at
    into v_source_lecture_id, v_source_deleted_at
  from public.source_references as sr
  where sr.id = v_source_reference_id
  for share of sr;

  if not found or v_source_deleted_at is not null then
    raise exception using
      errcode = 'BP009',
      message = 'BP_CROSS_LECTURE_LINK',
      detail = 'Concept-Source operations require an existing live source reference';
  end if;

  select c.blueprint_id, c.lecture_id, c.deleted_at
    into v_blueprint_id, v_concept_lecture_id, v_concept_deleted_at
  from public.concepts as c
  where c.id = case when tg_op = 'INSERT' then new.concept_id else old.concept_id end;

  select b.lifecycle_status, b.deleted_at
    into v_status, v_root_deleted_at
  from public.blueprints as b
  where b.id = v_blueprint_id
  for share of b;

  if v_status is null
     or v_status <> 'draft'
     or v_root_deleted_at is not null then
    raise exception using
      errcode = 'BP005',
      message = 'BP_IMMUTABLE',
      detail = 'Concept-Source links are editable only on a live draft';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.concept_id is distinct from old.concept_id
    or new.source_reference_id is distinct from old.source_reference_id
    or new.producer_class is distinct from old.producer_class
    or new.produced_at is distinct from old.produced_at
    or new.spec_version is distinct from old.spec_version
    or new.created_by is distinct from old.created_by
  ) then
    raise exception using
      errcode = 'BP021',
      message = 'BP_ENDPOINT_IMMUTABLE',
      detail = 'relationship endpoints and X-7 provenance cannot change';
  end if;

  if new.created_by is null
     or new.produced_at is null
     or new.spec_version is null
     or pg_catalog.btrim(new.spec_version) = '' then
    raise exception using
      errcode = 'BP021',
      message = 'BP_ENDPOINT_IMMUTABLE',
      detail = 'relationship X-7 provenance is required';
  end if;

  if new.deleted_at is null then
    if v_concept_lecture_id is null
       or v_concept_deleted_at is not null
       or v_concept_lecture_id <> v_source_lecture_id then
      raise exception using
        errcode = 'BP009',
        message = 'BP_CROSS_LECTURE_LINK',
        detail = 'live Concept-Source links require live endpoints in one lecture';
    end if;
  end if;

  return new;
end
$function$;

-- ============================================================================
-- 8. Trigger installation. DROP/CREATE makes partial re-application safe.
-- ============================================================================
drop trigger if exists trg_blueprints_biu on public.blueprints;
create trigger trg_blueprints_biu
  before insert or update on public.blueprints
  for each row execute function blueprint_internal.trg_blueprints_biu();

drop trigger if exists trg_learning_objectives_guard
  on public.learning_objectives;
create trigger trg_learning_objectives_guard
  before insert or update on public.learning_objectives
  for each row execute function blueprint_internal.trg_lobjectives_guard();

drop trigger if exists trg_concepts_guard on public.concepts;
create trigger trg_concepts_guard
  before insert or update on public.concepts
  for each row execute function blueprint_internal.trg_concepts_guard();

drop trigger if exists trg_concept_weights_guard on public.concept_weights;
create trigger trg_concept_weights_guard
  before insert or update on public.concept_weights
  for each row execute function blueprint_internal.trg_weights_guard();

drop trigger if exists trg_source_references_guard on public.source_references;
create trigger trg_source_references_guard
  before insert or update on public.source_references
  for each row execute function blueprint_internal.trg_source_refs_guard();

drop trigger if exists trg_concept_objectives_guard
  on public.concept_objectives;
create trigger trg_concept_objectives_guard
  before insert or update on public.concept_objectives
  for each row execute function blueprint_internal.trg_concept_objectives_guard();

drop trigger if exists trg_lo_source_refs_guard
  on public.learning_objective_source_references;
create trigger trg_lo_source_refs_guard
  before insert or update on public.learning_objective_source_references
  for each row execute function blueprint_internal.trg_lo_source_refs_guard();

drop trigger if exists trg_concept_source_refs_guard
  on public.concept_source_references;
create trigger trg_concept_source_refs_guard
  before insert or update on public.concept_source_references
  for each row execute function blueprint_internal.trg_concept_source_refs_guard();

drop trigger if exists trg_blueprints_no_hard_delete on public.blueprints;
create trigger trg_blueprints_no_hard_delete
  before delete on public.blueprints
  for each row execute function blueprint_internal.trg_blueprints_no_hard_delete();

drop trigger if exists trg_learning_objectives_no_hard_delete
  on public.learning_objectives;
create trigger trg_learning_objectives_no_hard_delete
  before delete on public.learning_objectives
  for each row execute function blueprint_internal.trg_learning_objectives_no_hard_delete();

drop trigger if exists trg_concepts_no_hard_delete on public.concepts;
create trigger trg_concepts_no_hard_delete
  before delete on public.concepts
  for each row execute function blueprint_internal.trg_concepts_no_hard_delete();

drop trigger if exists trg_concept_weights_no_hard_delete
  on public.concept_weights;
create trigger trg_concept_weights_no_hard_delete
  before delete on public.concept_weights
  for each row execute function blueprint_internal.trg_concept_weights_no_hard_delete();

drop trigger if exists trg_source_references_no_hard_delete
  on public.source_references;
create trigger trg_source_references_no_hard_delete
  before delete on public.source_references
  for each row execute function blueprint_internal.trg_source_references_no_hard_delete();

drop trigger if exists trg_concept_objectives_no_hard_delete
  on public.concept_objectives;
create trigger trg_concept_objectives_no_hard_delete
  before delete on public.concept_objectives
  for each row execute function blueprint_internal.trg_concept_objectives_no_hard_delete();

drop trigger if exists trg_lo_source_refs_no_hard_delete
  on public.learning_objective_source_references;
create trigger trg_lo_source_refs_no_hard_delete
  before delete on public.learning_objective_source_references
  for each row execute function blueprint_internal.trg_lo_source_refs_no_hard_delete();

drop trigger if exists trg_concept_source_refs_no_hard_delete
  on public.concept_source_references;
create trigger trg_concept_source_refs_no_hard_delete
  before delete on public.concept_source_references
  for each row execute function blueprint_internal.trg_concept_source_refs_no_hard_delete();

-- ============================================================================
-- 9. Public lifecycle RPCs.
-- ============================================================================
create or replace function public.submit_blueprint_review(
  p_blueprint_id pg_catalog.uuid
)
returns pg_catalog.uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.blueprints%rowtype;
  v_tokens pg_catalog.text[];
  v_actor pg_catalog.uuid;
  v_now pg_catalog.timestamptz;
begin
  if not public.is_admin() then
    raise exception using
      errcode = 'BP001',
      message = 'BP_NOT_ADMIN',
      detail = 'submit_blueprint_review requires an admin caller';
  end if;

  v_actor := auth.uid();
  v_now := pg_catalog.now();

  select b.*
    into v_target
  from public.blueprints as b
  where b.id = p_blueprint_id
  for update;

  if not found
     or v_target.deleted_at is not null
     or v_target.lifecycle_status <> 'draft' then
    raise exception using
      errcode = 'BP004',
      message = 'BP_WRONG_STATE',
      detail = 'target must be a live draft';
  end if;

  v_tokens :=
    blueprint_internal.blueprint_review_gate_tokens(p_blueprint_id);
  if pg_catalog.cardinality(v_tokens) > 0 then
    raise exception using
      errcode = 'BP010',
      message = 'BP_REVIEW_GATE',
      detail = pg_catalog.array_to_string(v_tokens, ',');
  end if;

  update public.blueprints
  set lifecycle_status = 'reviewed',
      reviewed_by = v_actor,
      reviewed_at = v_now
  where id = p_blueprint_id;

  return p_blueprint_id;
end
$function$;

create or replace function public.return_blueprint_to_draft(
  p_blueprint_id pg_catalog.uuid
)
returns pg_catalog.uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.blueprints%rowtype;
begin
  if not public.is_admin() then
    raise exception using
      errcode = 'BP001',
      message = 'BP_NOT_ADMIN',
      detail = 'return_blueprint_to_draft requires an admin caller';
  end if;

  select b.*
    into v_target
  from public.blueprints as b
  where b.id = p_blueprint_id
  for update;

  if not found
     or v_target.deleted_at is not null
     or v_target.lifecycle_status <> 'reviewed' then
    raise exception using
      errcode = 'BP004',
      message = 'BP_WRONG_STATE',
      detail = 'target must be a live reviewed Blueprint';
  end if;

  update public.blueprints
  set lifecycle_status = 'draft',
      reviewed_by = null,
      reviewed_at = null,
      approved_by = null,
      approved_at = null,
      frozen_at = null
  where id = p_blueprint_id;

  return p_blueprint_id;
end
$function$;

create or replace function public.approve_blueprint(
  p_blueprint_id pg_catalog.uuid
)
returns pg_catalog.uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lecture_id pg_catalog.uuid;
  v_target public.blueprints%rowtype;
  v_predecessor public.blueprints%rowtype;
  v_tokens pg_catalog.text[];
  v_actor pg_catalog.uuid;
  v_now pg_catalog.timestamptz;
  v_max_version pg_catalog.int4;
  v_live_approved_id pg_catalog.uuid;
begin
  if not public.is_admin() then
    raise exception using
      errcode = 'BP001',
      message = 'BP_NOT_ADMIN',
      detail = 'approve_blueprint requires an admin caller';
  end if;

  -- Lock order step 1: resolve lecture identity without locking the row.
  select b.lecture_id
    into v_lecture_id
  from public.blueprints as b
  where b.id = p_blueprint_id;

  if v_lecture_id is null then
    raise exception using
      errcode = 'BP004',
      message = 'BP_WRONG_STATE',
      detail = 'target Blueprint does not exist';
  end if;

  -- Lock order step 2: serialize all lifecycle work for this lecture.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_lecture_id::pg_catalog.text, 0)
  );

  -- Lock order step 3: re-read and lock target.
  select b.*
    into v_target
  from public.blueprints as b
  where b.id = p_blueprint_id
  for update;

  if not found
     or v_target.deleted_at is not null
     or v_target.lifecycle_status <> 'reviewed' then
    raise exception using
      errcode = 'BP004',
      message = 'BP_WRONG_STATE',
      detail = 'target must be a live reviewed Blueprint';
  end if;

  if v_target.lecture_id <> v_lecture_id then
    raise exception using
      errcode = 'BP020',
      message = 'BP_LINEAGE_INVALID',
      detail = 'target lecture identity changed during lock acquisition';
  end if;

  if v_target.supersedes_id is not null then
    select b.*
      into v_predecessor
    from public.blueprints as b
    where b.id = v_target.supersedes_id
    for update;

    if not found
       or v_predecessor.deleted_at is not null
       or v_predecessor.lifecycle_status <> 'approved'
       or v_predecessor.lecture_id <> v_target.lecture_id
       or v_predecessor.id = v_target.id
       or v_target.version <= v_predecessor.version then
      raise exception using
        errcode = 'BP020',
        message = 'BP_LINEAGE_INVALID',
        detail = 'successor must reference the live approved predecessor in the same lecture';
    end if;
  end if;

  -- Lock order step 4: revalidate complete state and lineage after all locks.
  select pg_catalog.max(b.version)
    into v_max_version
  from public.blueprints as b
  where b.lecture_id = v_target.lecture_id;

  if v_target.version <> v_max_version then
    raise exception using
      errcode = 'BP020',
      message = 'BP_LINEAGE_INVALID',
      detail = 'target version must be the canonical maximum for its lecture';
  end if;

  select b.id
    into v_live_approved_id
  from public.blueprints as b
  where b.lecture_id = v_target.lecture_id
    and b.lifecycle_status = 'approved'
    and b.deleted_at is null;

  if v_target.supersedes_id is null then
    if v_target.version <> 1 or v_live_approved_id is not null then
      raise exception using
        errcode = 'BP020',
        message = 'BP_LINEAGE_INVALID',
        detail = 'an initial approval must be version 1 with no approved predecessor';
    end if;
  elsif v_live_approved_id is distinct from v_target.supersedes_id then
    raise exception using
      errcode = 'BP020',
      message = 'BP_LINEAGE_INVALID',
      detail = 'supersedes_id must reference the currently live approved Blueprint';
  end if;

  if exists (
    select 1
    from public.concept_weights as w
    join public.concepts as c on c.id = w.concept_id
    where c.blueprint_id = p_blueprint_id
      and c.deleted_at is null
      and w.deleted_at is null
      and w.clw_state = 'assigned'
      and w.clw_value >= 2
  ) then
    raise exception using
      errcode = 'BP012',
      message = 'BP_CLW_CORRELATION_UNAVAILABLE',
      detail = 'assigned CLW >= 2 requires an attached Clinical Correlation, unavailable in Slice 1';
  end if;

  v_tokens :=
    blueprint_internal.blueprint_approval_gate_tokens(p_blueprint_id);
  if pg_catalog.cardinality(v_tokens) > 0 then
    raise exception using
      errcode = 'BP011',
      message = 'BP_APPROVAL_GATE',
      detail = pg_catalog.array_to_string(v_tokens, ',');
  end if;

  v_actor := auth.uid();
  v_now := pg_catalog.now();

  -- Lock order steps 5 and 6: retire predecessor, then approve target.
  begin
    if v_target.supersedes_id is not null then
      update public.blueprints
      set lifecycle_status = 'retired'
      where id = v_target.supersedes_id;
    end if;

    update public.blueprints
    set lifecycle_status = 'approved',
        approved_by = v_actor,
        approved_at = v_now,
        frozen_at = v_now
    where id = p_blueprint_id;
  exception
    when unique_violation then
      raise exception using
        errcode = 'BP015',
        message = 'BP_CONCURRENT_APPROVAL',
        detail = 'another transaction established an approved Blueprint for this lecture';
  end;

  return p_blueprint_id;
end
$function$;

create or replace function public.create_successor_blueprint(
  p_predecessor_id pg_catalog.uuid,
  p_spec_version pg_catalog.text
)
returns pg_catalog.uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lecture_id pg_catalog.uuid;
  v_predecessor public.blueprints%rowtype;
  v_new_blueprint_id pg_catalog.uuid;
  v_new_id pg_catalog.uuid;
  v_new_version pg_catalog.int4;
  v_actor pg_catalog.uuid;
  v_now pg_catalog.timestamptz;
  v_obj_map pg_catalog.jsonb := '{}'::pg_catalog.jsonb;
  v_concept_map pg_catalog.jsonb := '{}'::pg_catalog.jsonb;
  r pg_catalog.record;
begin
  if not public.is_admin() then
    raise exception using
      errcode = 'BP001',
      message = 'BP_NOT_ADMIN',
      detail = 'create_successor_blueprint requires an admin caller';
  end if;

  if p_spec_version is null
     or pg_catalog.btrim(p_spec_version) = '' then
    raise exception using
      errcode = 'BP014',
      message = 'BP_SPEC_VERSION_REQUIRED',
      detail = 'p_spec_version must be non-empty';
  end if;

  -- Lock order step 1: resolve lecture identity.
  select b.lecture_id
    into v_lecture_id
  from public.blueprints as b
  where b.id = p_predecessor_id;

  if v_lecture_id is null then
    raise exception using
      errcode = 'BP013',
      message = 'BP_SUCCESSOR_PRECONDITION',
      detail = 'predecessor does not exist';
  end if;

  -- Lock order step 2: serialize all lifecycle work for this lecture.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_lecture_id::pg_catalog.text, 0)
  );

  -- Lock order step 3: lock and revalidate predecessor.
  select b.*
    into v_predecessor
  from public.blueprints as b
  where b.id = p_predecessor_id
  for update;

  if not found
     or v_predecessor.deleted_at is not null
     or v_predecessor.lifecycle_status <> 'approved'
     or v_predecessor.lecture_id <> v_lecture_id then
    raise exception using
      errcode = 'BP013',
      message = 'BP_SUCCESSOR_PRECONDITION',
      detail = 'predecessor must be the live approved Blueprint';
  end if;

  if exists (
    select 1
    from public.blueprints as b
    where b.lecture_id = v_lecture_id
      and b.deleted_at is null
      and b.lifecycle_status in ('draft', 'reviewed')
  ) then
    raise exception using
      errcode = 'BP013',
      message = 'BP_SUCCESSOR_PRECONDITION',
      detail = 'a live draft or reviewed successor already exists';
  end if;

  select coalesce(pg_catalog.max(b.version), 0) + 1
    into v_new_version
  from public.blueprints as b
  where b.lecture_id = v_lecture_id;

  v_new_blueprint_id := pg_catalog.gen_random_uuid();
  v_actor := auth.uid();
  v_now := pg_catalog.now();

  insert into public.blueprints (
    id,
    lecture_id,
    version,
    lifecycle_status,
    supersedes_id,
    reviewed_by,
    reviewed_at,
    approved_by,
    approved_at,
    frozen_at,
    producer_class,
    produced_at,
    spec_version,
    created_by,
    deleted_at
  ) values (
    v_new_blueprint_id,
    v_lecture_id,
    v_new_version,
    'draft',
    p_predecessor_id,
    null,
    null,
    null,
    null,
    null,
    'human',
    v_now,
    p_spec_version,
    v_actor,
    null
  );

  -- Copy every live Objective, including rejected derived Objectives.
  for r in
    select o.*
    from public.learning_objectives as o
    where o.blueprint_id = p_predecessor_id
      and o.deleted_at is null
    order by o.id
  loop
    v_new_id := pg_catalog.gen_random_uuid();
    v_obj_map := v_obj_map || pg_catalog.jsonb_build_object(
      r.id::pg_catalog.text,
      v_new_id::pg_catalog.text
    );

    insert into public.learning_objectives (
      id,
      blueprint_id,
      lecture_id,
      text,
      origin,
      confirmation_status,
      testable_interpretation,
      decided_by,
      decided_at,
      producer_class,
      produced_at,
      spec_version,
      created_by,
      deleted_at
    ) values (
      v_new_id,
      v_new_blueprint_id,
      v_lecture_id,
      r.text,
      r.origin,
      r.confirmation_status,
      r.testable_interpretation,
      r.decided_by,
      r.decided_at,
      'human',
      v_now,
      p_spec_version,
      v_actor,
      null
    );
  end loop;

  -- Copy every live Concept.
  for r in
    select c.*
    from public.concepts as c
    where c.blueprint_id = p_predecessor_id
      and c.deleted_at is null
    order by c.id
  loop
    v_new_id := pg_catalog.gen_random_uuid();
    v_concept_map := v_concept_map || pg_catalog.jsonb_build_object(
      r.id::pg_catalog.text,
      v_new_id::pg_catalog.text
    );

    insert into public.concepts (
      id,
      blueprint_id,
      lecture_id,
      name,
      statement,
      producer_class,
      produced_at,
      spec_version,
      created_by,
      deleted_at
    ) values (
      v_new_id,
      v_new_blueprint_id,
      v_lecture_id,
      r.name,
      r.statement,
      'human',
      v_now,
      p_spec_version,
      v_actor,
      null
    );
  end loop;

  -- Copy live weight rows for copied live Concepts. An assigned SW is carried
  -- forward as a new, explicit human assignment on the successor: preserve the
  -- substantive SW decision, but stamp the current actor/time and new Blueprint
  -- version instead of mixing predecessor provenance with the successor.
  for r in
    select w.*, c.id as old_concept_id
    from public.concept_weights as w
    join public.concepts as c on c.id = w.concept_id
    where c.blueprint_id = p_predecessor_id
      and c.deleted_at is null
      and w.deleted_at is null
    order by w.id
  loop
    insert into public.concept_weights (
      id,
      concept_id,
      cw_state,
      cw_value,
      cw_evidence,
      cw_confidence,
      cw_rationale,
      clw_state,
      clw_value,
      clw_evidence,
      clw_confidence,
      clw_rationale,
      sw_state,
      sw_value,
      sw_source,
      sw_assigned_by,
      sw_confidence,
      sw_assigned_by_user_id,
      sw_rationale,
      sw_assigned_at,
      sw_blueprint_version,
      producer_class,
      produced_at,
      spec_version,
      created_by,
      deleted_at
    ) values (
      pg_catalog.gen_random_uuid(),
      (v_concept_map ->> r.old_concept_id::pg_catalog.text)::pg_catalog.uuid,
      r.cw_state,
      r.cw_value,
      r.cw_evidence,
      r.cw_confidence,
      r.cw_rationale,
      r.clw_state,
      r.clw_value,
      r.clw_evidence,
      r.clw_confidence,
      r.clw_rationale,
      r.sw_state,
      r.sw_value,
      r.sw_source,
      case when r.sw_state = 'assigned' then 'human' else r.sw_assigned_by end,
      r.sw_confidence,
      case when r.sw_state = 'assigned' then v_actor else r.sw_assigned_by_user_id end,
      r.sw_rationale,
      case when r.sw_state = 'assigned' then v_now else r.sw_assigned_at end,
      case when r.sw_state = 'assigned' then v_new_version else r.sw_blueprint_version end,
      'human',
      v_now,
      p_spec_version,
      v_actor,
      null
    );
  end loop;

  -- Copy valid live Concept-Objective links with both endpoints remapped.
  for r in
    select co.*
    from public.concept_objectives as co
    join public.concepts as c
      on c.id = co.concept_id
     and c.blueprint_id = p_predecessor_id
     and c.deleted_at is null
    join public.learning_objectives as o
      on o.id = co.objective_id
     and o.blueprint_id = p_predecessor_id
     and o.deleted_at is null
     and o.confirmation_status = 'confirmed'
     and o.origin in ('declared', 'derived')
    where co.deleted_at is null
    order by co.id
  loop
    insert into public.concept_objectives (
      id,
      concept_id,
      objective_id,
      producer_class,
      produced_at,
      spec_version,
      created_by,
      deleted_at
    ) values (
      pg_catalog.gen_random_uuid(),
      (v_concept_map ->> r.concept_id::pg_catalog.text)::pg_catalog.uuid,
      (v_obj_map ->> r.objective_id::pg_catalog.text)::pg_catalog.uuid,
      'human',
      v_now,
      p_spec_version,
      v_actor,
      null
    );
  end loop;

  -- Copy all live Objective source links, including links for rejected derived
  -- Objectives. Source references themselves are shared and are not copied.
  for r in
    select osr.*
    from public.learning_objective_source_references as osr
    join public.learning_objectives as o
      on o.id = osr.objective_id
     and o.blueprint_id = p_predecessor_id
     and o.deleted_at is null
    join public.source_references as sr
      on sr.id = osr.source_reference_id
     and sr.deleted_at is null
     and sr.lecture_id = v_lecture_id
    where osr.deleted_at is null
    order by osr.id
  loop
    insert into public.learning_objective_source_references (
      id,
      objective_id,
      source_reference_id,
      producer_class,
      produced_at,
      spec_version,
      created_by,
      deleted_at
    ) values (
      pg_catalog.gen_random_uuid(),
      (v_obj_map ->> r.objective_id::pg_catalog.text)::pg_catalog.uuid,
      r.source_reference_id,
      'human',
      v_now,
      p_spec_version,
      v_actor,
      null
    );
  end loop;

  -- Copy valid live Concept source links and reuse shared source references.
  for r in
    select csr.*
    from public.concept_source_references as csr
    join public.concepts as c
      on c.id = csr.concept_id
     and c.blueprint_id = p_predecessor_id
     and c.deleted_at is null
    join public.source_references as sr
      on sr.id = csr.source_reference_id
     and sr.deleted_at is null
     and sr.lecture_id = v_lecture_id
    where csr.deleted_at is null
    order by csr.id
  loop
    insert into public.concept_source_references (
      id,
      concept_id,
      source_reference_id,
      producer_class,
      produced_at,
      spec_version,
      created_by,
      deleted_at
    ) values (
      pg_catalog.gen_random_uuid(),
      (v_concept_map ->> r.concept_id::pg_catalog.text)::pg_catalog.uuid,
      r.source_reference_id,
      'human',
      v_now,
      p_spec_version,
      v_actor,
      null
    );
  end loop;

  return v_new_blueprint_id;
end
$function$;

-- ============================================================================
-- 10. Ownership and least-privilege normalization.
-- ============================================================================

-- Internal helpers and trigger functions are owned by the same trusted owner as
-- public.blueprints, so their SECURITY DEFINER reads see the complete aggregate
-- regardless of RLS. The lifecycle trigger remains SECURITY INVOKER.
do $migration$
declare
  v_owner pg_catalog.text;
  r pg_catalog.record;
begin
  select pg_catalog.pg_get_userbyid(c.relowner)
    into v_owner
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'blueprints'
    and c.relkind in ('r', 'p');

  if v_owner is not null then
    for r in
      select
        n.nspname,
        p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_args
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'blueprint_internal'
      order by p.proname, identity_args
    loop
      execute pg_catalog.format(
        'alter function %I.%I(%s) owner to %I',
        r.nspname,
        r.proname,
        r.identity_args,
        v_owner
      );
    end loop;
  end if;
end
$migration$;

-- PostgreSQL requires a prospective function owner to have CREATE on the
-- containing schema at ALTER OWNER time. Grant it only inside this migration
-- transaction, transfer the four RPCs, then revoke it immediately. The role has
-- no CREATE privilege in the committed state.
grant create on schema public to blueprint_rpc;

alter function public.submit_blueprint_review(pg_catalog.uuid)
  owner to blueprint_rpc;
alter function public.return_blueprint_to_draft(pg_catalog.uuid)
  owner to blueprint_rpc;
alter function public.approve_blueprint(pg_catalog.uuid)
  owner to blueprint_rpc;
alter function public.create_successor_blueprint(
  pg_catalog.uuid,
  pg_catalog.text
) owner to blueprint_rpc;

revoke create on schema public from blueprint_rpc;

-- Normalize any privileges that may remain from a partial prior application.
revoke all privileges on table
  public.blueprints,
  public.learning_objectives,
  public.concepts,
  public.concept_weights,
  public.source_references,
  public.concept_objectives,
  public.learning_objective_source_references,
  public.concept_source_references
from blueprint_rpc;

grant select, insert, update on table
  public.blueprints,
  public.learning_objectives,
  public.concepts,
  public.concept_weights,
  public.source_references,
  public.concept_objectives,
  public.learning_objective_source_references,
  public.concept_source_references
to blueprint_rpc;

revoke execute on all functions in schema blueprint_internal
  from public, anon, authenticated, authenticator, service_role, blueprint_rpc;

grant execute on function
  blueprint_internal.blueprint_root_status(pg_catalog.uuid),
  blueprint_internal.blueprint_owner_lecture(pg_catalog.uuid),
  blueprint_internal.blueprint_review_gate_tokens(pg_catalog.uuid),
  blueprint_internal.blueprint_approval_gate_tokens(pg_catalog.uuid)
to blueprint_rpc;

grant execute on function public.is_admin() to blueprint_rpc;

revoke execute on function
  public.submit_blueprint_review(pg_catalog.uuid),
  public.return_blueprint_to_draft(pg_catalog.uuid),
  public.approve_blueprint(pg_catalog.uuid),
  public.create_successor_blueprint(pg_catalog.uuid, pg_catalog.text)
from public, anon, authenticated, authenticator, service_role;

grant execute on function
  public.submit_blueprint_review(pg_catalog.uuid),
  public.return_blueprint_to_draft(pg_catalog.uuid),
  public.approve_blueprint(pg_catalog.uuid),
  public.create_successor_blueprint(pg_catalog.uuid, pg_catalog.text)
to authenticated;

-- blueprint_rpc is intentionally not granted DELETE, TRUNCATE, CREATE on public,
-- ownership of any Blueprint table, or membership to any application role.
--
-- Safe future removal of this cluster-level role requires first transferring or
-- dropping its four owned RPCs, revoking all privileges and policies that name
-- it, and removing role memberships/dependencies. Never blindly DROP ROLE.

-- ============================================================================
-- VERIFICATION (commented; run manually after applying Migration 022)
-- ============================================================================
/*
=== V1. Role attributes and memberships ========================================

select rolname, rolsuper, rolcanlogin, rolinherit, rolbypassrls, rolcreatedb,
       rolcreaterole, rolreplication
from pg_catalog.pg_roles
where rolname = 'blueprint_rpc';
-- expect all seven boolean attributes false

select
  pg_catalog.pg_has_role('anon',          'blueprint_rpc', 'MEMBER') as anon_member,
  pg_catalog.pg_has_role('authenticated', 'blueprint_rpc', 'MEMBER') as authenticated_member,
  pg_catalog.pg_has_role('authenticator', 'blueprint_rpc', 'MEMBER') as authenticator_member,
  pg_catalog.pg_has_role('service_role',  'blueprint_rpc', 'MEMBER') as service_role_member;
-- expect all false
-- pg_has_role(..., 'MEMBER') includes indirect membership paths.

select
  member_role.rolname as member_role,
  granted_role.rolname as granted_role,
  membership.admin_option
from pg_catalog.pg_auth_members as membership
join pg_catalog.pg_roles as member_role
  on member_role.oid = membership.member
join pg_catalog.pg_roles as granted_role
  on granted_role.oid = membership.roleid
where granted_role.rolname = 'blueprint_rpc';
-- expect at most trusted postgres; never an application-facing role

=== V2. Schema, function ownership, and EXECUTE ================================

select
  pg_catalog.has_schema_privilege(
    'authenticated', 'blueprint_internal', 'USAGE'
  ) as authenticated_internal_usage,
  pg_catalog.has_schema_privilege(
    'anon', 'blueprint_internal', 'USAGE'
  ) as anon_internal_usage,
  pg_catalog.has_schema_privilege(
    'service_role', 'blueprint_internal', 'USAGE'
  ) as service_internal_usage;
-- expect all false

select n.nspname, p.proname,
       pg_catalog.pg_get_userbyid(p.proowner) as owner,
       p.prosecdef,
       p.proconfig
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where (n.nspname = 'blueprint_internal')
   or (n.nspname = 'public' and p.proname in (
        'submit_blueprint_review',
        'return_blueprint_to_draft',
        'approve_blueprint',
        'create_successor_blueprint'
      ))
order by n.nspname, p.proname;
-- internal owner = trusted Blueprint table owner
-- public RPC owner = blueprint_rpc
-- all SECURITY DEFINER functions have search_path=""
-- trg_blueprints_biu is SECURITY INVOKER

select
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.approve_blueprint(uuid)',
    'EXECUTE'
  ) as authenticated_approve,
  pg_catalog.has_function_privilege(
    'authenticated',
    'blueprint_internal.blueprint_approval_gate_tokens(uuid)',
    'EXECUTE'
  ) as authenticated_internal,
  pg_catalog.has_function_privilege(
    'anon',
    'blueprint_internal.blueprint_approval_gate_tokens(uuid)',
    'EXECUTE'
  ) as anon_internal,
  pg_catalog.has_function_privilege(
    'service_role',
    'blueprint_internal.blueprint_approval_gate_tokens(uuid)',
    'EXECUTE'
  ) as service_internal;
-- expect true, false, false, false

=== V3. Table privileges and RLS bridge ========================================

select
  pg_catalog.has_table_privilege(
    'blueprint_rpc', 'public.blueprints', 'SELECT,INSERT,UPDATE'
  ) as rpc_write_set,
  pg_catalog.has_table_privilege(
    'blueprint_rpc', 'public.blueprints', 'DELETE'
  ) as rpc_delete;
-- expect true, false

select tablename, cmd, roles, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'blueprints',
    'learning_objectives',
    'concepts',
    'concept_weights',
    'source_references',
    'concept_objectives',
    'learning_objective_source_references',
    'concept_source_references'
  )
  and 'blueprint_rpc' = any(roles)
order by tablename, cmd;
-- expect SELECT/INSERT/UPDATE only, all gated by public.is_admin(); no DELETE

=== V4. Trigger coverage ========================================================

select event_object_table, trigger_name, event_manipulation,
       action_timing, action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in (
    'blueprints',
    'learning_objectives',
    'concepts',
    'concept_weights',
    'source_references',
    'concept_objectives',
    'learning_objective_source_references',
    'concept_source_references'
  )
order by event_object_table, trigger_name, event_manipulation;
-- expect an unconditional BEFORE DELETE guard on every table, a root BIU guard,
-- and a BEFORE INSERT/UPDATE guard on each child/join table.

=== V5. Lifecycle paths and authorization ======================================

-- As a non-admin JWT, each must fail with BP001 / BP_NOT_ADMIN:
select public.submit_blueprint_review('<BP_ID>'::pg_catalog.uuid);
select public.return_blueprint_to_draft('<BP_ID>'::pg_catalog.uuid);
select public.approve_blueprint('<BP_ID>'::pg_catalog.uuid);
select public.create_successor_blueprint(
  '<APPROVED_BP_ID>'::pg_catalog.uuid,
  'spec-v2'
);

-- As an admin JWT, a direct lifecycle update must fail BP002:
update public.blueprints
set lifecycle_status = 'reviewed'
where id = '<DRAFT_BP_ID>'::pg_catalog.uuid;

-- Legal RPC path:
select public.submit_blueprint_review('<READY_DRAFT_ID>'::pg_catalog.uuid);
select public.return_blueprint_to_draft('<REVIEWED_ID>'::pg_catalog.uuid);
select public.submit_blueprint_review('<READY_DRAFT_ID>'::pg_catalog.uuid);
select public.approve_blueprint('<REVIEWED_ID>'::pg_catalog.uuid);

-- Illegal transitions, transitions on deleted roots, and direct retirement must
-- produce BP002/BP003/BP004 as documented.

=== V6. Review and approval gates ==============================================

-- Build isolated draft fixtures and assert BP010 with deterministic DETAIL for:
-- NO_LIVE_CONCEPT, NO_ACTIVE_OBJECTIVE, DERIVED_PENDING,
-- DECLARED_NOT_CONFIRMED, LINK_TO_INACTIVE_OBJECTIVE, WEIGHT_PENDING,
-- CONCEPT_NO_SOURCE, OBJECTIVE_NO_SOURCE, CONCEPT_UNCOVERED,
-- OBJECTIVE_UNCOVERED, DEAD_LINK_PARTICIPANT.
--
-- From reviewed fixtures assert:
--   CW_NOT_ASSIGNED / SW_NOT_ASSIGNED / CLW_NOT_TERMINAL -> BP011
--   assigned CLW >= 2 -> BP012 / BP_CLW_CORRELATION_UNAVAILABLE
--   malformed predecessor/version/lecture chain -> BP020
-- Verify a failed gate leaves all rows and lifecycle stamps unchanged.

=== V7. Freeze, source lock, endpoints, and hard-delete ========================

-- Reviewed/approved/retired root or child edits -> BP005.
-- Structural/provenance edits on drafts -> BP018.
-- Declared objective text edit -> BP018.
-- Invalid derived decision shape -> BP019.
-- Join endpoint/provenance rewrite (live or soft-deleted) -> BP021.
-- Cross-Blueprint live coverage link -> BP008.
-- Cross-lecture live source link -> BP009.
-- Edit/soft-delete a source used by a non-draft live link -> BP006.
--
-- Assigned SW version must match its owning Blueprint version:
update public.concept_weights as w
set sw_blueprint_version = sw_blueprint_version + 99
from public.concepts as c
where w.concept_id = c.id
  and w.id = '<ASSIGNED_WEIGHT_ID>'::pg_catalog.uuid;
-- expect BP018 / BP_STRUCTURAL_IMMUTABLE with deterministic version detail

-- As admin and again from a service-role-like/BYPASSRLS session, each DELETE
-- must fail BP007 / BP_HARD_DELETE:
delete from public.blueprints where id = '<ID>'::pg_catalog.uuid;
delete from public.learning_objectives where id = '<ID>'::pg_catalog.uuid;
delete from public.concepts where id = '<ID>'::pg_catalog.uuid;
delete from public.concept_weights where id = '<ID>'::pg_catalog.uuid;
delete from public.source_references where id = '<ID>'::pg_catalog.uuid;
delete from public.concept_objectives where id = '<ID>'::pg_catalog.uuid;
delete from public.learning_objective_source_references
where id = '<ID>'::pg_catalog.uuid;
delete from public.concept_source_references
where id = '<ID>'::pg_catalog.uuid;

=== V8. Successor copy and ID remapping ========================================

select public.create_successor_blueprint(
  '<APPROVED_BP_ID>'::pg_catalog.uuid,
  'spec-v-next'
) as successor_id;

-- Compare predecessor/successor live counts for Objectives (including rejected),
-- Concepts, Weights, and all three join tables.
-- Verify every copied root/child/join id is new.
-- Verify source_reference_id values are reused and source_references count does
-- not increase.
-- Verify copied Objective origin/confirmation_status/decided_by/decided_at are
-- preserved.
-- Verify every copied row has producer_class='human', the new spec_version,
-- produced_at at the RPC timestamp, and created_by=the JWT admin.
-- Verify canonical successor version = max(all prior lecture versions)+1.
--
-- Assigned SW carry-forward provenance must use the successor version and the
-- current RPC actor/time while preserving value/source/confidence/rationale:
select w.sw_state, w.sw_value, w.sw_source, w.sw_assigned_by,
       w.sw_confidence, w.sw_rationale, w.sw_assigned_by_user_id,
       w.sw_assigned_at, w.sw_blueprint_version, b.version
from public.concept_weights as w
join public.concepts as c on c.id = w.concept_id
join public.blueprints as b on b.id = c.blueprint_id
where b.id = '<SUCCESSOR_ID>'::pg_catalog.uuid
  and w.deleted_at is null;
-- expect assigned rows: sw_assigned_by='human',
-- sw_assigned_by_user_id=auth.uid(), sw_assigned_at=successor creation time,
-- and sw_blueprint_version=b.version.

=== V9. Concurrency =============================================================

-- In two sessions for the same lecture:
-- 1. Concurrent create_successor_blueprint calls: exactly one succeeds; the
--    other waits on the lecture advisory lock then fails BP013.
-- 2. Concurrent approve_blueprint calls on one reviewed successor: exactly one
--    succeeds; the other fails BP004/BP015 after the lock.
-- 3. Concurrent successor creation vs approval: deterministic advisory-lock
--    serialization, no deadlock, no duplicate live approved/in-progress root.
-- After every scenario, assert exactly one live approved Blueprint and at most
-- one live draft/reviewed Blueprint for the lecture.

=== V9A. Freeze-barrier concurrency (two sessions) =============================

-- C1: child UPDATE versus submit_blueprint_review
-- Session A:
begin;
update public.concepts
set statement = statement || ' [authoring update]'
where id = '<CONCEPT_ID>'::pg_catalog.uuid;
-- Keep open: child trigger holds FOR SHARE on the owning Blueprint.
-- Session B:
begin;
select public.submit_blueprint_review('<BP_ID>'::pg_catalog.uuid);
-- BLOCKS until Session A commits. Then review revalidates the updated aggregate.
-- Session A:
commit;
-- Session B now completes or fails its gate based on Session A's final data.
commit;
--
-- Reverse ordering:
-- Session A starts submit_blueprint_review and leaves its transaction open after
-- the RPC returns (root FOR UPDATE remains held).
-- Session B runs the child UPDATE above; it BLOCKS.
-- Session A COMMIT; Session B wakes, re-reads status, and fails BP005.

-- C2: relationship soft-link/unlink versus submit_blueprint_review
-- Session A:
begin;
update public.concept_objectives
set deleted_at = pg_catalog.now()
where id = '<CONCEPT_OBJECTIVE_ID>'::pg_catalog.uuid;
-- Keep open: relationship trigger holds FOR SHARE on the owning Blueprint.
-- Session B:
begin;
select public.submit_blueprint_review('<BP_ID>'::pg_catalog.uuid);
-- BLOCKS; after Session A COMMIT, review sees the final unlinked aggregate.
-- Session A:
commit;
-- Session B completes only if the final aggregate still passes the review gate.
commit;
--
-- Reverse ordering: leave Session A's review RPC transaction open; Session B's
-- soft-link/unlink blocks, then fails BP005 after Session A commits reviewed.

-- C3: source-reference UPDATE versus submit_blueprint_review
-- Session A:
begin;
update public.source_references
set anchor_text = '<VALID UPDATED ANCHOR <= 15 WORDS>'
where id = '<SOURCE_REFERENCE_ID>'::pg_catalog.uuid;
-- Keep open: source guard holds deterministic FOR SHARE locks on every live
-- dependent Blueprint root.
-- Session B:
begin;
select public.submit_blueprint_review('<BP_ID>'::pg_catalog.uuid);
-- BLOCKS; after Session A COMMIT, review sees the final source content.
-- Session A:
commit;
-- Session B then completes or fails against that final content.
commit;
--
-- Reverse ordering: leave Session A's review RPC transaction open; Session B's
-- source UPDATE blocks on FOR SHARE, then fails BP006 after review commits.
--
-- In all three cases there is no schedule where review commits and the earlier
-- draft-authoring mutation commits afterward.

=== V9B. Source-link lock ordering and three-transaction freeze ================

-- C4: source-reference UPDATE versus live source-link INSERT
-- Session A:
begin;
update public.source_references
set anchor_text = '<VALID UPDATED ANCHOR <= 15 WORDS>'
where id = '<SOURCE_REFERENCE_ID>'::pg_catalog.uuid;
-- Keep open: the UPDATE owns the Source Reference row lock.
-- Session B:
begin;
insert into public.learning_objective_source_references (
  id, objective_id, source_reference_id, producer_class, produced_at,
  spec_version, created_by
) values (
  pg_catalog.gen_random_uuid(), '<OBJECTIVE_ID>'::pg_catalog.uuid,
  '<SOURCE_REFERENCE_ID>'::pg_catalog.uuid, 'human',
  pg_catalog.clock_timestamp(), '<SPEC_VERSION>', auth.uid()
);
-- BLOCKS on FOR SHARE OF sr. After Session A commits, Session B re-reads the
-- committed source lecture/deleted state before resolving and locking the root.
-- Session A:
commit;
-- Session B succeeds only if the final source and Objective remain live,
-- lecture-compatible, and the owning Blueprint remains a live draft.
commit;
--
-- Repeat with public.concept_source_references and <CONCEPT_ID>.

-- Reverse ordering:
-- Session A:
begin;
insert into public.concept_source_references (
  id, concept_id, source_reference_id, producer_class, produced_at,
  spec_version, created_by
) values (
  pg_catalog.gen_random_uuid(), '<CONCEPT_ID>'::pg_catalog.uuid,
  '<SOURCE_REFERENCE_ID>'::pg_catalog.uuid, 'human',
  pg_catalog.clock_timestamp(), '<SPEC_VERSION>', auth.uid()
);
-- Keep open: the link trigger holds Source FOR SHARE, then Blueprint FOR SHARE.
-- Session B:
begin;
update public.source_references
set anchor_text = '<ANOTHER VALID ANCHOR <= 15 WORDS>'
where id = '<SOURCE_REFERENCE_ID>'::pg_catalog.uuid;
-- BLOCKS on the Source Reference until Session A commits.
-- Session A:
commit;
-- Session B resumes; its source guard discovers and locks every committed live
-- dependent Blueprint root in deterministic UUID order before revalidation.
commit;

-- C5: three-transaction Source UPDATE -> source-link INSERT/restore -> review
-- Session A:
begin;
update public.source_references
set anchor_text = '<VALID UPDATED ANCHOR <= 15 WORDS>'
where id = '<SOURCE_REFERENCE_ID>'::pg_catalog.uuid;
-- Keep open.
-- Session B:
begin;
-- INSERT a live Objective/Concept source link, or restore one with
-- SET deleted_at = null. It BLOCKS first on the Source Reference.
-- Session C:
begin;
select public.submit_blueprint_review('<BP_ID>'::pg_catalog.uuid);
--
-- Verify every possible completion is serialized:
-- * If review commits before the blocked link becomes visible, Session B later
--   acquires Source then Blueprint and fails BP005 against the non-draft root.
-- * If Session B acquires Source then Blueprint first, review waits for its root
--   lock and revalidates the committed link plus Session A's final source state.
-- * If review wins the root lock after the link commits but before a waiting
--   source mutation reaches the root, that mutation wakes and fails BP006.
-- There is no outcome where review succeeds and a linked source mutation commits
-- afterward without observing the non-draft Blueprint.
rollback;
-- Roll back or commit each session as appropriate between schedule variants,
-- then verify lifecycle status, link visibility, and final source content.

=== V10. SQLSTATE uniqueness ====================================================

-- Static mapping expected exactly once at the top of this migration:
-- BP001..BP021 map one-to-one to the 21 documented MESSAGE tokens.

=== ROLE REMOVAL SAFETY =========================================================

-- Do not DROP ROLE blueprint_rpc blindly. Safe removal requires dropping or
-- reassigning its four owned RPCs, removing policies naming it, revoking all
-- object/schema privileges, and removing its trusted postgres membership first.
*/
