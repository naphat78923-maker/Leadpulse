-- 2026-09-23: add deals.buyer_reply — the buyer's reply verbatim (first-person,
-- exactly as received). Kept separate from last_outcome, which is the rep's
-- paraphrase. The local Laya buyer-response interpretation prefers this field
-- because first-person buyer text scores far better than reported speech.
-- Evidence: scripts/eval_results/2026-09-23-buyer-response-eval-report.md

alter table public.deals add column if not exists buyer_reply text;
