-- Laya judgments — saved raw answers from the local Laya worker
--
-- ADDITIVE. Append-only: one row per scoring run of one frozen question set
-- (src/utils/laya-questions.json) against one deal or company. The Mac worker
-- writes; the app reads. Design: docs/laya-judgments-store.md.
--
-- What this table is NOT:
--   * not a grade, qualification or contact authorization — it holds the model's
--     raw answers; any grade is computed in code from these rows
--   * not CRM state — it never changes deals or companies
--   * not a place for an unvalidated answer — the worker writes only answers its
--     validator accepted, or an explicit not_scored refusal
--
-- Unlike the other app tables, this one is NOT "Allow all for anon". The browser
-- may read it; only the worker, using the service-role key on the Mac, may write.
-- A page can therefore never forge or edit a model judgment.

create table if not exists public.laya_judgments (
  id uuid primary key default gen_random_uuid(),

  -- exactly one subject, matching the question set (see subject check)
  deal_id uuid references public.deals(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,

  -- a set name from laya-questions.json, and the SHA-256 of its exact questions
  -- JSON: a wording change is a new questions_sha256, so old rows go stale
  question_set text not null,
  questions_sha256 text not null,

  -- SHA-256 of the exact /score request body, JSON.stringify({state, questions}).
  -- The app recomputes it from the current CRM row to tell fresh from stale.
  input_sha256 text not null,
  scored_state text not null,

  status text not null,
  not_scored_code text,
  answers jsonb,
  usage_input_tokens integer,

  model_repository text not null,
  model_revision text not null,
  model_package_sha256 text not null,
  engine text not null,

  scored_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint laya_judgments_question_set_check
    check (question_set in ('buyer', 'terminal', 'fit')),

  -- deal sets judge a deal; the fit set judges a company
  constraint laya_judgments_subject_check check (
    (question_set in ('buyer', 'terminal') and deal_id is not null and company_id is null)
    or (question_set = 'fit' and company_id is not null and deal_id is null)
  ),

  constraint laya_judgments_hash_check check (
    questions_sha256 ~ '^[0-9a-f]{64}$'
    and input_sha256 ~ '^[0-9a-f]{64}$'
    and model_package_sha256 ~ '^[0-9a-f]{64}$'
  ),

  constraint laya_judgments_engine_check check (engine in ('cpu_ne', 'cpu_gpu')),

  -- a scored row carries an answers object; a refusal carries its reason and no
  -- answers. coalesce(): a CHECK passes on NULL, and jsonb_typeof(NULL) is NULL.
  constraint laya_judgments_status_check check (
    (status = 'scored' and coalesce(jsonb_typeof(answers) = 'object', false) and not_scored_code is null)
    or (status = 'not_scored' and answers is null
        and coalesce(not_scored_code in ('contact_opt_out', 'input_too_long'), false))
  ),

  constraint laya_judgments_usage_check
    check (usage_input_tokens is null or usage_input_tokens > 0)
);

-- The same input scored by the same model is one row, so a retried worker run
-- cannot duplicate it. A new model package re-judges.
create unique index if not exists laya_judgments_dedupe_idx on public.laya_judgments (
  question_set, coalesce(deal_id, company_id), input_sha256, model_package_sha256
);

create index if not exists laya_judgments_deal_idx
  on public.laya_judgments (deal_id, question_set, scored_at desc) where deal_id is not null;
create index if not exists laya_judgments_company_idx
  on public.laya_judgments (company_id, question_set, scored_at desc) where company_id is not null;

-- Latest judgment per subject and question set. security_invoker so the reader's
-- RLS applies through the view.
create or replace view public.laya_judgments_latest
with (security_invoker = true) as
select distinct on (question_set, coalesce(deal_id, company_id)) *
from public.laya_judgments
order by question_set, coalesce(deal_id, company_id), scored_at desc, created_at desc;

alter table public.laya_judgments enable row level security;

-- Read-only for the app. No insert/update/delete policy exists, so only the
-- service role (which bypasses RLS) can write; the grants below make that
-- explicit rather than relying on the missing policy alone.
drop policy if exists "Read for app" on public.laya_judgments;
create policy "Read for app" on public.laya_judgments
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.laya_judgments from anon, authenticated;
grant select on public.laya_judgments to anon, authenticated;
grant select on public.laya_judgments_latest to anon, authenticated;
