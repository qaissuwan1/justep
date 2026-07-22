-- ============================================================================
-- JUstep — Blueprint persistence schema (021)  [Slice 1: structural, additive]
--
-- Creates the 8-table Blueprint aggregate approved in:
--   docs/implementation/DATABASE-DESIGN.md  (§1 / §1.2 / §2.2 / §4 / §5)
--   docs/implementation/SLICE-1-PLAN.md      (§3 / §4 / §6)
-- (design docs live in the sibling JUStep-AI repository)
--
-- Tables:
--   1. blueprints                            X-10/X-11 versioned AGGREGATE ROOT
--   2. learning_objectives                   child
--   3. concepts                              child
--   4. concept_weights                       child, 1:1 with concepts
--   5. source_references                     lecture-local, shared across versions
--   6. concept_objectives                    pure join (M:N)
--   7. learning_objective_source_references  pure join
--   8. concept_source_references             pure join
--
-- AGGREGATE-ROOT VERSIONING (DATABASE-DESIGN §1.2): lifecycle_status / version /
-- supersedes_id live ONLY on `blueprints`. Children carry X-7 provenance but NO
-- independent lifecycle / version / supersedes_id; they inherit immutability from
-- the root (enforced in 022, not here).
--
-- STRUCTURAL and ADDITIVE ONLY:
--   * no ALTER / DROP on existing tables (questions, flashcards, lectures,
--     topics, subjects, systems, user_progress, question_marks, flashcard_*) —
--     they are not referenced destructively and are left untouched
--   * no data backfill, no destructive operation
--   * idempotent where safe: CREATE TABLE/INDEX IF NOT EXISTS; policies are
--     drop-then-create. (Note: CREATE TABLE IF NOT EXISTS will not retro-fit a
--     constraint onto a table left half-created by a partial prior run — same
--     limitation as the existing 007/012/... migrations.)
--
-- ROW-LOCAL consistency IS enforced here via CHECK constraints. DEFERRED TO 022:
--   * transition-legality, same-blueprint, same-lecture, and >=1-source triggers
--   * approved-aggregate immutability trigger
--   * hard-DELETE guard trigger (defense-in-depth; 021 RLS denies DELETE only to the
--     browser/API roles, not to BYPASSRLS / service_role contexts)
--   * dimension-specific APPROVAL gate (CW assigned, SW assigned, CLW terminal;
--     every active objective / live concept has >=1 source reference; bidirectional
--     concept<->objective coverage)
--   * approve_blueprint / create_successor_blueprint RPCs (SECURITY DEFINER)
--
-- Weights store ONLY the three dimensions via the reusable `weight_ordinal`
-- domain (exactly {0,1,2,3}; fractional input is REJECTED, never rounded). EP is
-- never stored and no EP coefficient formula is implemented here (DOC-004 §17, WT-5).
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ============================================================================
-- Reusable weight domain — the canonical ordinal {0, 1, 2, 3}.
--
-- Base type is `numeric` ON PURPOSE (not smallint/integer): assigning a
-- fractional literal to an integer target makes PostgreSQL's ASSIGNMENT CAST
-- silently ROUND it (1.5 -> 2) BEFORE any CHECK runs. With a `numeric` base the
-- value 1.5 is preserved, so the domain CHECK rejects it. `numeric(1,0)` is NOT
-- used because it would round on the cast too — the base must be unconstrained
-- `numeric`. Accepts EXACTLY 0/1/2/3; rejects fractional values and any value
-- < 0 or > 3. Applied to cw_value / clw_value / sw_value.
--
-- Guarded for idempotency (CREATE DOMAIN has no IF NOT EXISTS) — same guard
-- style the repo already uses for CHECK constraints in migration 014.
-- ============================================================================
do $$
begin
  create domain public.weight_ordinal as numeric
    check (value in (0, 1, 2, 3));
exception
  when duplicate_object then null;
end
$$;

-- ============================================================================
-- 1. blueprints — the X-10/X-11 versioned AGGREGATE ROOT
-- ============================================================================
create table if not exists public.blueprints (
  id                uuid primary key default gen_random_uuid(),                 -- X-1/X-2
  lecture_id        uuid not null references public.lectures (id) on delete restrict,  -- protect history (never cascade-delete an authored blueprint)
  version           int  not null default 1 check (version >= 1),
  lifecycle_status  text not null default 'draft'
                      check (lifecycle_status in ('draft','reviewed','approved','retired')),  -- X-10
  supersedes_id     uuid references public.blueprints (id) on delete restrict,   -- X-11 successor chain (root-only); RESTRICT protects a superseded predecessor from hard-delete
  -- review / approval provenance (transitions themselves are enforced in 022)
  reviewed_by       uuid references public.profiles (id) on delete set null,
  reviewed_at       timestamptz,
  approved_by       uuid references public.profiles (id) on delete set null,
  approved_at       timestamptz,
  frozen_at         timestamptz,                                                 -- set at approval (022)
  -- X-7 provenance
  producer_class    text not null default 'human'
                      check (producer_class in ('analyzer','planner','generator','reviewer','human','evidence')),
  produced_at       timestamptz not null default now(),
  spec_version      text not null check (btrim(spec_version) <> ''),
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null,  -- acting admin identity
  deleted_at        timestamptz,                                                 -- P5 soft-delete
  constraint blueprints_lecture_version_unique unique (lecture_id, version)
);

-- Two partial-unique indexes: at most one live approved AND at most one live
-- in-progress (draft|reviewed) blueprint per lecture. This deliberately ALLOWS
-- an approved predecessor and a draft/reviewed successor to coexist (a single
-- "<> retired" predicate would wrongly block successor creation).
create unique index if not exists uq_blueprints_one_live_approved
  on public.blueprints (lecture_id)
  where lifecycle_status = 'approved' and deleted_at is null;
create unique index if not exists uq_blueprints_one_live_in_progress
  on public.blueprints (lecture_id)
  where lifecycle_status in ('draft','reviewed') and deleted_at is null;

create index if not exists idx_blueprints_lecture    on public.blueprints (lecture_id) where deleted_at is null;
create index if not exists idx_blueprints_lifecycle  on public.blueprints (lifecycle_status);
create index if not exists idx_blueprints_supersedes on public.blueprints (supersedes_id);

-- ============================================================================
-- 2. learning_objectives — child of blueprints
--    Canonical confirmation vocabulary {confirmed,pending,rejected} (DOC-004 §3
--    / LO-2) — NOT the analytical {derived,confirmed,rejected}.
-- ============================================================================
create table if not exists public.learning_objectives (
  id                       uuid primary key default gen_random_uuid(),
  blueprint_id             uuid not null references public.blueprints (id) on delete cascade,   -- aggregate child
  lecture_id               uuid not null references public.lectures (id) on delete restrict,    -- N1 anchor
  text                     text not null check (btrim("text") <> ''),                            -- declared = verbatim (LO-3; edit-immutability in 022); non-empty
  origin                   text not null check (origin in ('declared','derived')),              -- LO-1
  confirmation_status      text not null default 'pending'
                             check (confirmation_status in ('confirmed','pending','rejected')), -- LO-2 (app sets declared -> 'confirmed' on insert)
  testable_interpretation  text,                                                                -- LO-4
  decided_by               uuid references public.profiles (id) on delete set null,             -- who confirmed/rejected (LO-2 decision provenance)
  decided_at               timestamptz,
  -- X-7 provenance
  producer_class           text not null default 'human'
                             check (producer_class in ('analyzer','planner','generator','reviewer','human','evidence')),
  produced_at              timestamptz not null default now(),
  spec_version             text not null check (btrim(spec_version) <> ''),
  created_by               uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at               timestamptz
);
create index if not exists idx_lobjectives_blueprint    on public.learning_objectives (blueprint_id) where deleted_at is null;
create index if not exists idx_lobjectives_lecture      on public.learning_objectives (lecture_id);
create index if not exists idx_lobjectives_confirmation on public.learning_objectives (confirmation_status);

-- ============================================================================
-- 3. concepts — child of blueprints
--    FORBIDDEN (DOC-004 §17): no ep / priority / score / is_high_yield /
--    difficulty_score columns exist on this table by construction.
-- ============================================================================
create table if not exists public.concepts (
  id             uuid primary key default gen_random_uuid(),
  blueprint_id   uuid not null references public.blueprints (id) on delete cascade,
  lecture_id     uuid not null references public.lectures (id) on delete restrict,
  name           text not null check (btrim("name") <> ''),   -- noun phrase (CO-6); non-empty
  statement      text not null check (btrim(statement) <> ''),
  -- X-7 provenance
  producer_class text not null default 'human'
                   check (producer_class in ('analyzer','planner','generator','reviewer','human','evidence')),
  produced_at    timestamptz not null default now(),
  spec_version   text not null check (btrim(spec_version) <> ''),
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at     timestamptz
);
-- case-insensitive unique concept name within a blueprint (CO-6, no duplicates)
create unique index if not exists uq_concepts_blueprint_name on public.concepts (blueprint_id, lower(name)) where deleted_at is null;  -- live-only: a soft-deleted concept does not reserve its name
create index if not exists idx_concepts_blueprint on public.concepts (blueprint_id) where deleted_at is null;
create index if not exists idx_concepts_lecture   on public.concepts (lecture_id);

-- ============================================================================
-- 4. concept_weights — child, 1:1 with concepts
--    Three dimensions, each the `weight_ordinal` domain (exactly {0,1,2,3};
--    DOC-003 §6.2-§6.4; DOC-004 §5). Fractional input is rejected, not rounded.
--    Explicit state per dimension (X-4; realizes CO-7 "no weight null"):
--      pending        -> not yet assessed (value NULL); != assigned 0
--      assigned       -> a determinate integer 0..3 (0 is a valid value)
--      not_assessable -> could not determine; requires a non-empty rationale, no value
--    M1 SW: assigned_by only 'human' (reference_base forbidden until §11.1, WT-3).
--    Row-LOCAL consistency is enforced by the three CHECKs below; the
--    dimension-specific APPROVAL gate (CW/SW assigned, CLW terminal) is 022.
-- ============================================================================
create table if not exists public.concept_weights (
  id            uuid primary key default gen_random_uuid(),
  concept_id    uuid not null unique references public.concepts (id) on delete cascade,  -- 1:1

  -- CW (WT-1, lecture-derived)
  cw_state      text not null default 'pending' check (cw_state in ('pending','assigned','not_assessable')),
  cw_value      public.weight_ordinal,   -- exactly {0,1,2,3}; fractions rejected (no silent rounding); 0 valid
  cw_evidence   text,
  cw_confidence text check (cw_confidence in ('high','medium','low')),  -- X-9
  cw_rationale  text,

  -- CLW (WT-2). FULL canonical domain 0..3. WT-2 ("CLW >= 2 requires an attached
  -- Clinical Correlation") is a CROSS-OBJECT invariant, NOT a column restriction:
  -- it belongs to a later approval rule (022+), once Clinical Correlations exist.
  -- The persistence schema preserves the full {0,1,2,3} domain here.
  clw_state      text not null default 'pending' check (clw_state in ('pending','assigned','not_assessable')),
  clw_value      public.weight_ordinal,
  clw_evidence   text,
  clw_confidence text check (clw_confidence in ('high','medium','low')),
  clw_rationale  text,

  -- SW (WT-3, manual in M1)
  sw_state               text not null default 'pending' check (sw_state in ('pending','assigned','not_assessable')),
  sw_value               public.weight_ordinal,
  sw_source              text,                                              -- DOC-004 §5: external reference consulted, or an 'unknown' marker
  sw_assigned_by         text check (sw_assigned_by in ('human')),          -- M1: only 'human'; reference_base rejected outright (DOC-004 §5 / WT-3)
  sw_confidence          text check (sw_confidence in ('high','medium','low')),
  sw_assigned_by_user_id uuid references public.profiles (id) on delete set null,  -- admin identity (X-7)
  sw_rationale           text,
  sw_assigned_at         timestamptz,
  sw_blueprint_version   int,

  -- X-7 provenance (of the weights row itself)
  producer_class text not null default 'human'
                   check (producer_class in ('analyzer','planner','generator','reviewer','human','evidence')),
  produced_at    timestamptz not null default now(),
  spec_version   text not null check (btrim(spec_version) <> ''),
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at     timestamptz,

  -- Row-local state consistency (X-4) — MUTUALLY EXCLUSIVE: each state pins EVERY
  -- relevant field so no stale field can coexist. Assigned 0 is legal (value NOT
  -- NULL) and distinct from pending (value NULL).
  --   CW/CLW: rationale is reserved for not_assessable (NULL when assigned);
  --           confidence is NULL for both pending and not_assessable.
  --   SW: rationale is required when assigned (owner mandate) AND when
  --       not_assessable. The not_assessable decision's who/when is carried by the
  --       row's X-7 provenance (created_by / produced_at), so ALL sw assignment
  --       fields (value/source/assigned_by/confidence/user_id/assigned_at/
  --       blueprint_version) are NULL in that state — no stale assigned provenance.
  constraint cw_state_consistency check (
       (cw_state = 'pending'        and cw_value is null and cw_evidence is null and cw_confidence is null and cw_rationale is null)
    or (cw_state = 'assigned'       and cw_value is not null and cw_evidence is not null and btrim(cw_evidence) <> '' and cw_confidence is not null and cw_rationale is null)
    or (cw_state = 'not_assessable' and cw_value is null and cw_evidence is null and cw_confidence is null and cw_rationale is not null and btrim(cw_rationale) <> '')
  ),
  constraint clw_state_consistency check (   -- full 0..3 domain; WT-2 (>=2 needs a correlation) is a later cross-object rule
       (clw_state = 'pending'        and clw_value is null and clw_evidence is null and clw_confidence is null and clw_rationale is null)
    or (clw_state = 'assigned'       and clw_value is not null and clw_evidence is not null and btrim(clw_evidence) <> '' and clw_confidence is not null and clw_rationale is null)
    or (clw_state = 'not_assessable' and clw_value is null and clw_evidence is null and clw_confidence is null and clw_rationale is not null and btrim(clw_rationale) <> '')
  ),
  constraint sw_state_consistency check (
       (sw_state = 'pending'        and sw_value is null and sw_source is null and sw_assigned_by is null and sw_confidence is null
                                    and sw_assigned_by_user_id is null and sw_rationale is null and sw_assigned_at is null and sw_blueprint_version is null)
    or (sw_state = 'assigned'       and sw_value is not null and sw_source is not null and btrim(sw_source) <> ''
                                    and sw_assigned_by = 'human' and sw_confidence is not null and sw_assigned_by_user_id is not null
                                    and sw_rationale is not null and btrim(sw_rationale) <> ''
                                    and sw_assigned_at is not null and sw_blueprint_version is not null and sw_blueprint_version >= 1)
    or (sw_state = 'not_assessable' and sw_value is null and sw_source is null and sw_assigned_by is null and sw_confidence is null
                                    and sw_assigned_by_user_id is null and sw_assigned_at is null and sw_blueprint_version is null
                                    and sw_rationale is not null and btrim(sw_rationale) <> '')
  )
);
-- (concept_id already has a unique index from the UNIQUE column constraint)

-- ============================================================================
-- 5. source_references — lecture-local, shared across blueprint versions
--    Minimum typed locator contract (DOC-004 §12). Each ref BELONGS to exactly
--    one lecture (lecture_id). Preventing a *link* to an object in a different
--    lecture is a SAME-LECTURE trigger in 022 -- NOT enforced in 021. anchor_text
--    is capped at <=15 words via a row-local CHECK (no trigger).
-- ============================================================================
create table if not exists public.source_references (
  id             uuid primary key default gen_random_uuid(),
  lecture_id     uuid not null references public.lectures (id) on delete restrict,  -- lecture-local (N1/SF-1)
  locator_type   text not null check (locator_type in ('slide','page','section','timestamp')),
  locator_value  text not null check (btrim(locator_value) <> ''),
  anchor_text    text not null
                   check (btrim(anchor_text) <> ''
                          and array_length(regexp_split_to_array(btrim(anchor_text), '\s+'), 1) <= 15),  -- <=15 words
  relation       text not null check (relation in ('states','defines','supports','illustrates')),
  -- X-7 provenance
  producer_class text not null default 'human'
                   check (producer_class in ('analyzer','planner','generator','reviewer','human','evidence')),
  produced_at    timestamptz not null default now(),
  spec_version   text not null check (btrim(spec_version) <> ''),
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at     timestamptz    -- soft-delete only (referenced anchors are protected; hard-delete blocked by RESTRICT on the joins)
);
-- Dedup identical anchors within a lecture — among LIVE rows only, so re-adding an
-- anchor after soft-deleting the old one is permitted (soft-delete uniqueness note).
create unique index if not exists uq_source_refs_dedupe
  on public.source_references (lecture_id, locator_type, locator_value, anchor_text)
  where deleted_at is null;
create index if not exists idx_source_refs_lecture on public.source_references (lecture_id) where deleted_at is null;

-- ============================================================================
-- 6. concept_objectives — pure join (M:N), version-scoped aggregate child
--    DEFERRED TO 022: same-blueprint validation; bidirectional coverage;
--    immutability when the root is approved.
-- ============================================================================
create table if not exists public.concept_objectives (
  id             uuid primary key default gen_random_uuid(),
  concept_id     uuid not null references public.concepts (id) on delete cascade,
  objective_id   uuid not null references public.learning_objectives (id) on delete cascade,
  -- X-7 provenance (link row)
  producer_class text not null default 'human'
                   check (producer_class in ('analyzer','planner','generator','reviewer','human','evidence')),
  produced_at    timestamptz not null default now(),
  spec_version   text not null check (btrim(spec_version) <> ''),
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint concept_objectives_unique unique (concept_id, objective_id)
);
create index if not exists idx_concept_objectives_concept   on public.concept_objectives (concept_id);
create index if not exists idx_concept_objectives_objective on public.concept_objectives (objective_id);

-- ============================================================================
-- 7. learning_objective_source_references — pure join
--    source_reference_id RESTRICT: a source reference cannot be hard-deleted
--    while any objective links it. DEFERRED TO 022: same-lecture validation and
--    the >=1-source-per-active-objective approval minimum.
-- ============================================================================
create table if not exists public.learning_objective_source_references (
  id                  uuid primary key default gen_random_uuid(),
  objective_id        uuid not null references public.learning_objectives (id) on delete cascade,
  source_reference_id uuid not null references public.source_references (id) on delete restrict,
  producer_class      text not null default 'human'
                        check (producer_class in ('analyzer','planner','generator','reviewer','human','evidence')),
  produced_at         timestamptz not null default now(),
  spec_version        text not null check (btrim(spec_version) <> ''),
  created_by          uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint lo_source_refs_unique unique (objective_id, source_reference_id)
);
create index if not exists idx_lo_source_refs_objective on public.learning_objective_source_references (objective_id);
create index if not exists idx_lo_source_refs_source    on public.learning_objective_source_references (source_reference_id);

-- ============================================================================
-- 8. concept_source_references — pure join
--    DEFERRED TO 022: same-lecture validation; the >=1-source-per-live-concept
--    approval minimum.
-- ============================================================================
create table if not exists public.concept_source_references (
  id                  uuid primary key default gen_random_uuid(),
  concept_id          uuid not null references public.concepts (id) on delete cascade,
  source_reference_id uuid not null references public.source_references (id) on delete restrict,
  producer_class      text not null default 'human'
                        check (producer_class in ('analyzer','planner','generator','reviewer','human','evidence')),
  produced_at         timestamptz not null default now(),
  spec_version        text not null check (btrim(spec_version) <> ''),
  created_by          uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint concept_source_refs_unique unique (concept_id, source_reference_id)
);
create index if not exists idx_concept_source_refs_concept on public.concept_source_references (concept_id);
create index if not exists idx_concept_source_refs_source  on public.concept_source_references (source_reference_id);

-- ============================================================================
-- Row Level Security — ADMIN-ONLY, and NO hard-delete via RLS.
-- Each table gets three admin-only policies: SELECT, INSERT, UPDATE. There is
-- deliberately NO DELETE policy, so a hard DELETE from the browser/API roles
-- (`anon` / `authenticated`) is RLS-denied. In Slice 1, deletion is SOFT (an
-- UPDATE of `deleted_at`) and RESTORE is an UPDATE too — both covered by the
-- UPDATE policy. Ordinary authenticated users are default-denied (is_admin() =
-- false). Admins intentionally see soft-deleted rows (to restore); the
-- application filters `deleted_at is null` for ordinary live reads.
--
-- CAVEAT: RLS does NOT constrain the table owner, `postgres`, or `service_role`
-- (they have BYPASSRLS) — those contexts can still hard-DELETE and cascade.
-- FULL hard-delete protection (a BEFORE DELETE trigger raising an exception,
-- effective for every role) is defense-in-depth DEFERRED TO MIGRATION 022.
-- Uses the existing public.is_admin() (migration 003). No SECURITY DEFINER here.
-- ============================================================================
alter table public.blueprints                            enable row level security;
alter table public.learning_objectives                   enable row level security;
alter table public.concepts                              enable row level security;
alter table public.concept_weights                       enable row level security;
alter table public.source_references                     enable row level security;
alter table public.concept_objectives                    enable row level security;
alter table public.learning_objective_source_references  enable row level security;
alter table public.concept_source_references             enable row level security;

-- blueprints
drop policy if exists "blueprints_admin_all"    on public.blueprints;   -- supersede any older 021 FOR ALL policy
drop policy if exists "blueprints_admin_select" on public.blueprints;
create policy "blueprints_admin_select" on public.blueprints for select to authenticated using (public.is_admin());
drop policy if exists "blueprints_admin_insert" on public.blueprints;
create policy "blueprints_admin_insert" on public.blueprints for insert to authenticated with check (public.is_admin());
drop policy if exists "blueprints_admin_update" on public.blueprints;
create policy "blueprints_admin_update" on public.blueprints for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- learning_objectives
drop policy if exists "learning_objectives_admin_all"    on public.learning_objectives;
drop policy if exists "learning_objectives_admin_select" on public.learning_objectives;
create policy "learning_objectives_admin_select" on public.learning_objectives for select to authenticated using (public.is_admin());
drop policy if exists "learning_objectives_admin_insert" on public.learning_objectives;
create policy "learning_objectives_admin_insert" on public.learning_objectives for insert to authenticated with check (public.is_admin());
drop policy if exists "learning_objectives_admin_update" on public.learning_objectives;
create policy "learning_objectives_admin_update" on public.learning_objectives for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- concepts
drop policy if exists "concepts_admin_all"    on public.concepts;
drop policy if exists "concepts_admin_select" on public.concepts;
create policy "concepts_admin_select" on public.concepts for select to authenticated using (public.is_admin());
drop policy if exists "concepts_admin_insert" on public.concepts;
create policy "concepts_admin_insert" on public.concepts for insert to authenticated with check (public.is_admin());
drop policy if exists "concepts_admin_update" on public.concepts;
create policy "concepts_admin_update" on public.concepts for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- concept_weights
drop policy if exists "concept_weights_admin_all"    on public.concept_weights;
drop policy if exists "concept_weights_admin_select" on public.concept_weights;
create policy "concept_weights_admin_select" on public.concept_weights for select to authenticated using (public.is_admin());
drop policy if exists "concept_weights_admin_insert" on public.concept_weights;
create policy "concept_weights_admin_insert" on public.concept_weights for insert to authenticated with check (public.is_admin());
drop policy if exists "concept_weights_admin_update" on public.concept_weights;
create policy "concept_weights_admin_update" on public.concept_weights for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- source_references
drop policy if exists "source_references_admin_all"    on public.source_references;
drop policy if exists "source_references_admin_select" on public.source_references;
create policy "source_references_admin_select" on public.source_references for select to authenticated using (public.is_admin());
drop policy if exists "source_references_admin_insert" on public.source_references;
create policy "source_references_admin_insert" on public.source_references for insert to authenticated with check (public.is_admin());
drop policy if exists "source_references_admin_update" on public.source_references;
create policy "source_references_admin_update" on public.source_references for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- concept_objectives
drop policy if exists "concept_objectives_admin_all"    on public.concept_objectives;
drop policy if exists "concept_objectives_admin_select" on public.concept_objectives;
create policy "concept_objectives_admin_select" on public.concept_objectives for select to authenticated using (public.is_admin());
drop policy if exists "concept_objectives_admin_insert" on public.concept_objectives;
create policy "concept_objectives_admin_insert" on public.concept_objectives for insert to authenticated with check (public.is_admin());
drop policy if exists "concept_objectives_admin_update" on public.concept_objectives;
create policy "concept_objectives_admin_update" on public.concept_objectives for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- learning_objective_source_references
drop policy if exists "lo_source_refs_admin_all"    on public.learning_objective_source_references;
drop policy if exists "lo_source_refs_admin_select" on public.learning_objective_source_references;
create policy "lo_source_refs_admin_select" on public.learning_objective_source_references for select to authenticated using (public.is_admin());
drop policy if exists "lo_source_refs_admin_insert" on public.learning_objective_source_references;
create policy "lo_source_refs_admin_insert" on public.learning_objective_source_references for insert to authenticated with check (public.is_admin());
drop policy if exists "lo_source_refs_admin_update" on public.learning_objective_source_references;
create policy "lo_source_refs_admin_update" on public.learning_objective_source_references for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- concept_source_references
drop policy if exists "concept_source_refs_admin_all"    on public.concept_source_references;
drop policy if exists "concept_source_refs_admin_select" on public.concept_source_references;
create policy "concept_source_refs_admin_select" on public.concept_source_references for select to authenticated using (public.is_admin());
drop policy if exists "concept_source_refs_admin_insert" on public.concept_source_references;
create policy "concept_source_refs_admin_insert" on public.concept_source_references for insert to authenticated with check (public.is_admin());
drop policy if exists "concept_source_refs_admin_update" on public.concept_source_references;
create policy "concept_source_refs_admin_update" on public.concept_source_references for update to authenticated using (public.is_admin()) with check (public.is_admin());

/*
=== VERIFICATION — run in the Supabase SQL editor / psql after applying 021 ===

-- 0. Weight domain exists (base type numeric, so fractions are rejected not rounded)
SELECT domain_name, data_type FROM information_schema.domains
WHERE domain_schema='public' AND domain_name='weight_ordinal';   -- expect 1 row, data_type = numeric

-- 1. All eight tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN
 ('blueprints','learning_objectives','concepts','concept_weights','source_references',
  'concept_objectives','learning_objective_source_references','concept_source_references')
ORDER BY table_name;   -- expect 8 rows

-- 2. Foreign keys on the new tables
SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name
JOIN information_schema.referential_constraints rc ON rc.constraint_name=tc.constraint_name
WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
  AND tc.table_name IN ('blueprints','learning_objectives','concepts','concept_weights',
      'source_references','concept_objectives','learning_objective_source_references','concept_source_references')
ORDER BY tc.table_name, kcu.column_name;

-- 3. Partial unique indexes on blueprints (approved / in-progress coexistence)
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND indexname IN
 ('uq_blueprints_one_live_approved','uq_blueprints_one_live_in_progress');

-- 4. RLS enabled on all eight
SELECT relname, relrowsecurity FROM pg_class
WHERE relnamespace='public'::regnamespace AND relname IN
 ('blueprints','learning_objectives','concepts','concept_weights','source_references',
  'concept_objectives','learning_objective_source_references','concept_source_references')
ORDER BY relname;   -- relrowsecurity = t for all

-- 5. Policies: exactly SELECT/INSERT/UPDATE per table (24 total) and NO DELETE policy
SELECT cmd, count(*) FROM pg_policies
WHERE schemaname='public' AND tablename IN
 ('blueprints','learning_objectives','concepts','concept_weights','source_references',
  'concept_objectives','learning_objective_source_references','concept_source_references')
GROUP BY cmd ORDER BY cmd;   -- expect SELECT=8, INSERT=8, UPDATE=8; NO 'DELETE' row

-- 6a. These should ERROR (domain / state CHECKs reject invalid values or states):
--   INSERT ... concept_weights (concept_id, cw_state, cw_value) VALUES (<c>, 'assigned', 4);        -- > 3 (domain rejects)
--   INSERT ... concept_weights (concept_id, cw_state, cw_value) VALUES (<c>, 'assigned', 1.5);      -- FRACTION rejected, NOT rounded (weight_ordinal / numeric base)
--   INSERT ... concept_weights (concept_id, cw_state, cw_value) VALUES (<c>, 'assigned', -1);       -- < 0 (domain rejects)
--   INSERT ... concept_weights (concept_id, cw_state, cw_value) VALUES (<c>, 'pending', 0);         -- pending must have NULL value (distinct from assigned 0)
--   INSERT ... concept_weights (concept_id, sw_state, sw_value, sw_assigned_by, sw_source, sw_confidence,
--            sw_assigned_by_user_id, sw_rationale, sw_assigned_at, sw_blueprint_version)
--            VALUES (<c>, 'assigned', 2, 'reference_base', 's', 'high', <u>, 'r', now(), 1);         -- reference_base rejected
--   INSERT ... concept_weights (concept_id, cw_state, cw_rationale) VALUES (<c>, 'not_assessable', ''); -- empty rationale rejected
-- 6b. These should SUCCEED (full CLW canonical domain 0..3 is now persistable):
--   INSERT ... concept_weights (concept_id, clw_state, clw_value, clw_evidence, clw_confidence)
--            VALUES (<c>, 'assigned', 2, 'e', 'high');   -- CLW 2 persists (WT-2 correlation rule is a later cross-object gate)
--   INSERT ... concept_weights (concept_id, clw_state, clw_value, clw_evidence, clw_confidence)
--            VALUES (<c>, 'assigned', 3, 'e', 'high');   -- CLW 3 persists
*/
