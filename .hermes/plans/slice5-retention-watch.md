# LeadPulse Slice 5 — Retention / Account-Watch for Successful Clients

**Goal:** A CRM "watch" that keeps *successful* clients (won deals / active customers) forever,
quantifying the attached `customer_retention_diagnostic_framework.csv` into a weighted, auto-calculated
account-health model with early-warning + corrective playbooks.

> NOTE on Telegram: no Telegram bot/token/CLI exists in this environment, so findings are delivered
> in-chat + written to `Hy3_packet/`. If automated posting is wanted later, a bot token + channel id
> is required (see bottom).

## Research synthesis (sources: front.com, hyperengage, zoominfo, cdp.com, accoil, churnzero, gainsight)
- **Leading > lagging.** Score signals that *precede* churn (silence gap, outcome decay, no referral),
  not confirmations (already lost).
- **Weighted model** wins over single metrics: assign weights by correlation to renewal/expansion.
- **Keep ≤7–9 at-risk indicators** (ChurnZero). We use 5 — one per CSV row.
- **Proactive triggers**: alert when a score crosses a threshold or a single red flag trips.
- **Decay**: scores should drop with inactivity (time-weighted), not just snapshot.

## Framework → LeadPulse signal mapping (v1, NO new data capture)
| CSV row (behavior) | LeadPulse signals available | Metric we compute |
|---|---|---|
| Won't convert | n/a for *successful* clients (pre-sale) | excluded from watch; kept in framework doc |
| Buy once, don't return | 1 won deal + 0 repeat deals; meetings w/ neutral/neg outcome | **Repeat Rate**, **First-Use Outcome** |
| Repeat, don't refer | multiple won deals, 0 `referral`/advocate events, no `note` praising | **Advocacy Score** (referral events / referrals logged) |
| Churn after repeats | `last_contacted_date` / `lastTouch` gap > threshold; deals `closed_lost` | **Recency / Silence Gap**, **Win-back flag** |
| High freq, low value | many meetings/small `value`; single `product` only | **AOV proxy** (value), **Product Breadth** (distinct products) |

## Proposed data model (additive, soft-delete safe)
- `account_health` VIEW/table per company (computed, cached):
  `company_id, health_score (0–100), tier (at_risk|watch|healthy|champion),
   repeat_rate, advocacy_score, silence_days, aov_proxy, product_breadth,
   last_computed_at, top_risk_flag`
- `account_events` (append): `referral`, `advocacy_note`, `reorder`, `replenishment_sent`,
  `winback_triggered` — feeds advocacy + repeat signals.
- No schema break: existing `meetings`, `deals`, `companies`, `contacts` already carry the inputs.

## Weighted formula (auto-calc, tunable weights)
health = 100
 - w_recency   * silencePenalty(silence_days)      // e.g. 30
 - w_repeat    * (1 - repeatRate) * 100            // e.g. 25
 - w_advocacy  * (1 - advocacyScore) * 100         // e.g. 20
 - w_value     * (1 - valueNorm) * 100             // e.g. 15
 + w_positive  * positiveOutcomeBonus              // e.g. 10 (recent positive meetings lift)
Thresholds: >=80 Champion · 60–79 Healthy · 40–59 Watch · <40 At-risk.
All weights live in one `RETENTION_WEIGHTS` config object (your "discretion" → sensible defaults, editable).

## UI surfaces
1. **New `/retention` page** — "Account Watch": ranked company cards, health ring, top risk flag,
   champion highlights. Mobile-first, clay design, mascot (mascot-won?).
2. **Company detail** — health panel + signal breakdown + corrective action (from CSV) + log
   `referral`/`reorder` events.
3. **Nudges/Today integration** — at-risk accounts surface as a "Protect" segment.
4. **Alerts** — when a Champion drops to Watch or an At-risk flag trips, toast + Activity event.

## Build slices (each = build green + deploy)
- 5a: `src/utils/retention.ts` — pure scoring functions + `RETENTION_WEIGHTS` + signal extractors.
- 5b: `src/lib/retention.ts` — DB read of inputs, compute + cache `account_health`.
- 5c: `/retention` page (cards, ring, tiers).
- 5d: Company detail health panel + event logging (`referral`, `reorder`).
- 5e: Wire at-risk into Nudges "Protect" + Activity alerts.
- 5f: Migrate the CSV framework into the app as reference copy + tooltips.

## Open questions for Pat (consult before 5b)
- Auto-create `account_events` table via Supabase dashboard SQL, or keep advocacy as manual log only?
- "Forever" cadence: monthly recompute cron vs on-read compute? (recommend on-read + daily cache)
- Should referral tracking require contacts opting in, or just Pat logging it?

## Telegram delivery gap
No bot token/CLI/skill present. To auto-post: provide `TELEGRAM_BOT_TOKEN` + channel `@id`,
then a small script posts plan/findings. Until then, content is delivered in-chat and to `Hy3_packet/`.
