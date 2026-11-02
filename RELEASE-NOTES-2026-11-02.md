# Workspace redesign and content reset

- New cream and forest green landing page, shared theme, subject browser and responsive admin layout.
- Systems navigation removed; existing subject relationships retained.
- Student flashcard route now shows Coming soon, including direct and session links.
- Question archive view supports restoring existing records.
- Answer persistence now checks errors, allows retries, and coalesces concurrent submissions. Finishing a block saves selected answers before showing results.
- JSON import rejects null/scalar roots, invalid collection types, null answer indexes and paused flashcard imports; checks dedup lookup errors and duplicates within a batch.
- Dashboard reports query failures and disables empty sessions.

## Production data operations

At 2026-11-02 09:48:36.395151 UTC, soft-archived the two existing systems Endocrine and Gastrointestinal, their 126 active questions and 211 active flashcards. Three previously archived questions remain archived. Preserved all 354 attempt records. Subjects and lectures were retained.

The Supabase migration `restrict_student_question_reads_to_published` changed `questions_select_authenticated` to:

```sql
USING ((deleted_at IS NULL AND published IS TRUE) OR public.is_admin())
```

## Validation

- Production Vercel deployment confirmed READY and matched the pushed commit.
- Browser confirmed Coming soon, zero active questions, 129 archived questions with Restore controls, new homepage and subject navigation without Systems.
- Isolated mocked persistence check confirmed retry after failure and suppression of concurrent/repeated successful writes. This does not test ambiguous network failures after a server commit; server-side idempotency remains future work.
- No real student answers or new medical content were created during testing.

## Remaining work

- Full question session acceptance testing with a dedicated test dataset before publishing new question batches.
- Import preview, content review workflow and deeper visual refinement of account/analytics screens.
- Bundle splitting (Vite still reports a large main bundle).
- Remaining audit items are tracked in the parent workspace audit report; this release is not a claim that every issue is resolved.
