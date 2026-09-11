-- Prospect Review — saved review decision (Slice A)
--
-- ADDITIVE. One row per company, holding a human review note: a decision, a reason
-- from a closed vocabulary, an evidence note, and one next action.
--
-- What this table is NOT:
--   * not a sales qualification — a saved decision says nothing about whether the
--     account is qualified, serviceable, or cleared for contact
--   * not CRM account state — it never sets companies.status and is deliberately
--     kept out of the deals pipeline
--   * not an evaluator input — fit score, reachability and archetype membership are
--     computed without reading this table
--
-- Check constraints mirror the TypeScript vocabulary in
-- src/utils/prospectReviewDecision.ts. If one changes, change the other in the same
-- commit: the database is the second copy that catches a bad writer.

create table if not exists public.prospect_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  decision text not null,
  reason_code text not null,
  reason_note text,
  -- '<archetype_id>#<criterion index>' pointing at a criterion committed in
  -- src/utils/campaignArchetypes.ts, so a rejection cannot rest on an invented
  -- requirement. Resolved and validated in the app; the database only bounds the shape.
  criterion_ref text,
  reviewed_at timestamptz not null default now(),
  next_action text,
  next_action_owner text,
  next_action_due date,
  evidence_note text,
  evidence_links text[],
  needs_data_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prospect_reviews_decision_check
    check (decision in ('shortlist', 'needs_research', 'not_a_fit')),

  -- each reason code belongs to exactly one decision
  constraint prospect_reviews_decision_reason_check check (
    (decision = 'shortlist' and reason_code in (
      'plausible_application', 'relationship_history', 'verified_route', 'strategic_priority'))
    or (decision = 'needs_research' and reason_code in (
      'insufficient_evidence', 'route_unverified', 'buying_process_unknown', 'identity_unconfirmed'))
    or (decision = 'not_a_fit' and reason_code in (
      'wrong_business_type', 'no_plausible_application', 'cannot_serve_logistically',
      'possible_duplicate', 'outside_scope_overseas_hold', 'other_contradicted_criterion'))
  ),

  -- a next action without an owner is not a next action
  constraint prospect_reviews_owner_check
    check (next_action is null or length(btrim(coalesce(next_action_owner, ''))) > 0),

  -- a due date without an action would sit on the deal board with nothing to do
  constraint prospect_reviews_due_check
    check (next_action_due is null or next_action is not null),

  -- an exclusion always carries its reason in words
  constraint prospect_reviews_exclusion_note_check
    check (decision <> 'not_a_fit' or length(btrim(coalesce(reason_note, ''))) > 0),

  -- the duplicate flag is a flag for review, so it must name the counterpart
  constraint prospect_reviews_duplicate_note_check
    check (reason_code <> 'possible_duplicate' or length(btrim(coalesce(reason_note, ''))) > 0)
);

create index if not exists prospect_reviews_decision_idx on public.prospect_reviews (decision);
create index if not exists prospect_reviews_due_idx on public.prospect_reviews (next_action_due);

alter table public.prospect_reviews enable row level security;

-- Same single permissive policy as the tables this app already writes from the
-- browser (companies, contacts, deals, meetings, interactions). This is NOT a
-- security boundary: the app has no authentication layer, so anyone holding the
-- anon key can read and write these rows exactly as they can on those tables.
drop policy if exists "Allow all for anon" on public.prospect_reviews;
create policy "Allow all for anon" on public.prospect_reviews
  for all to public using (true) with check (true);
