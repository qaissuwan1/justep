-- ============================================================================
-- JUstep — Topic backfill, DATA (013)
-- Creates the manually-approved topic rows and back-fills topic_id on existing
-- content. Depends on the schema from migration 012.
--
-- Execution order matters and is NOT the same as the rule numbering: a flashcard
-- inherits its topic from its lecture, and a lecture infers its topic from its
-- questions — so we run topics → questions → lectures → flashcards.
--
-- The free-text questions.topic column is intentionally LEFT IN PLACE as a
-- safety net / audit trail; nothing here drops or clears it. Anything that does
-- not match an approved topic is left with topic_id = NULL (honestly unmapped,
-- for an admin to assign later) rather than routed to a catch-all entity.
--
-- Every step is idempotent: topic inserts use ON CONFLICT DO NOTHING, and every
-- UPDATE only touches rows whose topic_id is still NULL, so re-running will not
-- clobber values an admin has since set by hand.
-- ============================================================================

-- 1. Create the approved topics ----------------------------------------------
-- Subjects are matched by name, case-insensitively and trimmed. Joining (rather
-- than sub-selecting) means a topic is skipped silently if its subject is absent
-- — no NULL subject_id, no error.
with approved (subject_name, topic_name) as (
  values
    ('microbiology', 'Vibrio, Aeromonas, Campylobacter, and Helicobacter'),
    ('microbiology', 'Brucella'),
    ('microbiology', 'Abdominal TB'),
    ('microbiology', 'Coxiella'),
    ('microbiology', 'Leptospira'),
    ('microbiology', 'Mycobacteria'),
    ('microbiology', 'Cross-cutting'),
    ('pathology',    'Liver Tumors and Hepatocellular Carcinoma (HCC)')
)
insert into public.topics (subject_id, name)
select s.id, a.topic_name
from approved a
join public.subjects s
  on lower(btrim(s.name)) = lower(btrim(a.subject_name))
on conflict do nothing;

-- 2. Back-fill questions.topic_id --------------------------------------------
-- Match the question's free-text topic to an approved topic name within the
-- SAME subject (trimmed, case-insensitive). Non-matches stay NULL.
update public.questions q
set topic_id = t.id
from public.topics t
where t.subject_id = q.subject_id
  and lower(btrim(q.topic)) = lower(btrim(t.name))
  and q.topic_id is null;

-- 3. Infer lectures.topic_id from their questions ----------------------------
-- Only when EVERY question on the lecture shares one single non-null topic_id.
-- (no NULLs among them, and exactly one distinct value). Otherwise left NULL.
update public.lectures l
set topic_id = agg.topic_id
from (
  select q.lecture_id, min(q.topic_id) as topic_id
  from public.questions q
  where q.lecture_id is not null
  group by q.lecture_id
  having count(*) = count(q.topic_id)      -- no question has a NULL topic_id
     and count(distinct q.topic_id) = 1    -- and they all agree on one topic
) agg
where l.id = agg.lecture_id
  and l.topic_id is null;

-- 4. Back-fill flashcards.topic_id from their lecture ------------------------
-- A flashcard inherits the topic its lecture was just assigned. Cards with no
-- lecture, or a lecture with no topic, stay NULL.
update public.flashcards f
set topic_id = l.topic_id
from public.lectures l
where f.lecture_id = l.id
  and l.topic_id is not null
  and f.topic_id is null;
