# Neutral contact initialization — approved rollout

## Status (2026-10-14)

Supabase access to LeadPulse (`mkyhikarlxuwvprjabbi`) was restored. Before applying, the live schema matched the guard's expectation: default `'active'`, a single `contacts_status_check` on status with the five original values, 143 contacts (116 active, 14 no_response, 7 replied, 5 not_interested, 1 parked). Pat re-approved in chat and the migration was applied as `contact_uncontacted_status` (version `20261014110356`). The app change ships in its own PR after the post-apply readback. Step 5 (enrichment cron `--allow-new-uncontacted`) remains OFF pending separate approval.

## Earlier execution blocker (resolved)

Pat approved the attached migration and app rollout in this chat. No further design approval is required for that reviewed scope. Execution is blocked on database access: the current Supabase CLI session lists the ERP project, while the runtime and linked repository point to LeadPulse project `mkyhikarlxuwvprjabbi`. An isolated CLI workspace avoided the repository's `.env.local` parsing problem and used its existing IPv4 pooler metadata, but the read-only linked database query returned HTTP 403: the account lacks necessary project privileges.

The logged-in browser fallback was unavailable because the Brave profile was locked; the desktop alternative exposed no browser windows. No browser was closed and no authentication settings were changed.

Vercel access and the production alias were verified. Deployment was deliberately not started because the database migration must be verified first. No production schema or CRM records were changed, no cron was rerun, and the neutral-creation activation flag and existing cron prompt remain unchanged. Restore Supabase access to the correct project before proceeding; do not deploy the new app default against an unverified database.

The sections below preserve the reviewed scope, earlier local test evidence and rollout order.

## Decision and current state

Pat selected a separately reviewed database/app change introducing `uncontacted`, rather than allowing the enrichment job to label new researched contacts `active`.

The helper/app source changes and migration are prepared locally. The production database, deployed application and cron prompt have NOT been changed. No job has been rerun. New-contact creation in the profile helper is held by default; permitted enrichment of existing contact-route fields remains available.

`uncontacted` is the neutral initial state for a newly added route. It is not evidence of a send, reply, buyer interest, an order, or that the account has never been contacted through another route. Existing historical statuses must not be inferred or backfilled.

## Changes to review

- Profile helper validates generated payloads before dry-run reporting and before HTTP writes, rather than trusting only caller-supplied fields.
- Existing contact-status PATCHes remain forbidden, including attempts to reset an existing record to `uncontacted`.
- A newly created route can explicitly initialize only `status = uncontacted`; missing status or `active`/response-status initialization is rejected. This path additionally requires `--allow-new-uncontacted`, which remains OFF by default.
- New-contact readback verifies the whole proposed row, including status and company linkage. An INSERT followed by failed verification is recorded as a partial write and held; downstream notes/deal-link writes stop.
- LeadPulse supports the new type, label and contact-editor option. New-contact forms, company inline contact creation and website-derived route creation use the neutral default. Explicit user-selected historical/response statuses remain available in the UI.
- Fresh-install schema and the proposed migration allow the neutral state and default to it. The migration contains no UPDATE, DELETE, or historical backfill.

Migration: `supabase/migrations/20261013000000_contact_uncontacted_status.sql`

Local test: `scripts/test-contact-uncontacted-migration.py`

## Actual verification

- Helper regression tests: 13 passed, using only reserved fixtures and mocked CRM/network writes. They cover default-off creation, final-payload enforcement, neutral-only initialization, preservation of an existing replied status, and partial-write readback failure handling.
- App-focused tests: 25 passed across four discovered test files (route construction, contact editor, creation modal, CRM provider).
- Source/production-generated-route TypeScript check passed using a scratch config that excludes stale `.next/dev` artifacts. The normal check initially encountered an existing generated reference to the removed `/api/enrich/search` route; production route types were regenerated. This is not a claim that a production build/deploy passed.
- ESLint reported 22 errors and one warning in the touched legacy components. Baseline HEAD checks reported the same error/warning counts and rules. These unrelated existing lint issues were not rewritten as part of this fix.
- Migration executed successfully against a real isolated PostgreSQL 17.11 cluster over a private Unix socket; no TCP listener and no production connection. Six baseline fixture rows were preserved exactly, the default changed from active to uncontacted, explicit neutral inserts succeeded, invalid/null statuses were rejected, rerunning the migration preserved rows, and an unexpected extra status constraint failed closed. The test cluster was stopped and cleaned up.
- Audrey Group live-CRM dry run proposed one neutral route contact and zero writes. All 15 observed HTTP requests were GETs. Sweetcottage was excluded from that input because its identity needs review. That exercise used the earlier fills as code-test input, not as renewed verification of source freshness or outreach permission.
- Dry-run receipt: `/Users/pat/.hermes/profiles/ebimaru/reports/enrichment-receipts/2026-10-13-1244-route-enrichment.json`.

## Required approval and deployment order

1. Review/approve the SQL and application changes before any production rollout. A direction decision alone does not authorize executing the migration.
2. Before applying, inspect the actual deployed status default and constraint. The REST OpenAPI root was unavailable (HTTP 401), so the repository schema and isolated database test are NOT proof of the deployed schema.

```sql
SELECT column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'status';

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.contacts'::regclass AND contype = 'c';

SELECT status, count(*) FROM public.contacts GROUP BY status ORDER BY status;
```

3. Apply the reviewed migration first. Its transaction, short lock timeout and expected-constraint guard prevent a partial schema rollout; unexpected schema requires another review rather than forced application. Read back the default/constraint and confirm existing-row status/history snapshots are unchanged.
4. Deploy the reviewed app changes after the database supports the new state. No commit, push or deploy has been performed here.
5. Amend the enrichment cron's field policy only after rollout approval: permit explicit `uncontacted` initialization on a newly created verified route row, but continue forbidding every existing contact-status update and every other commercial field change. Keep timing, delivery, run cap and suppression rules unchanged. Enable `--allow-new-uncontacted` only at this activation step.
6. Refresh route sources and company identity, then run a dry run. Do not replay the old whole batch: Sweetcottage remains unresolved, and prior receipt contents do not grant new approval or prove present-day source accuracy. A one-account apply or manual cron trigger needs explicit authorization.

## Rollback safety

Do not relabel or delete neutral contacts to force an old constraint to fit. Once neutral rows exist, keep the expanded constraint unless a separate reviewed data migration establishes what every affected row should mean. Existing statuses remain historical evidence; do not normalize them merely to make a dashboard or older code look correct.
