# LeadPulse Slice 5 — Touch-Cadence & Intermittent Reward System (Plan)

**Status:** PLAN ONLY — no code written yet. Awaiting Pat review (per "plan first" rule).
**Depends on:** `src/app/retention/page.tsx` (Account-Watch board, built) + `src/utils/accountHealth.ts` (verified score).
**Date:** 2026-08-22

---

## 0. Scope rule (Pat, hard constraint)
> "The customer retention system only takes care of successful customers only."

So the retention system (cadence + rewards) is gated to **won customers**:
- INCLUDED: `company.status === 'active_customer'` only.
- EXCLUDED: `prospect` (stays in deal pipeline), `inactive`, `lost`.
- The `/retention` board already filters on signal; this plan tightens it to
  `active_customer` as the single entry gate. A prospect can NEVER appear in a
  "due for touch" / reward queue.

---

## 1. Touch-Cadence System (the "human touch" engine)

**Idea:** each active customer has a *next human-touch date* derived from its
health tier + account type. The board shows a **Due for touch** queue; logging
a touch (existing "Log touch" button) **resets the clock**. This turns the
scoreboard into a working retention loop.

### 1.1 Tier → cadence (base interval, days)
| Tier | Base interval | Rationale |
|------|---------------|-----------|
| healthy  | 90  | They're happy — quarterly check-in, don't over-contact |
| watch    | 45  | Slipping — monthly human touch + relevant sample |
| at_risk  | 21  | Losing them — bi-weekly win-back, no pitch |
| dormant  | 30  | Gone quiet — re-activation touch (lighter than at_risk) |

Interval is also modulated by `accountType` expected reorder gap
(`accountHealth.ts` EXPECTED_INTERVAL: hotel 90 / restaurant 45 / bakery 30 /
modern_trade 30 / other 60) — the shorter of (tier interval, account interval)
wins, so a bakery on quarterly contact still gets monthly. Keeps it solo-sane.

### 1.2 Where the date lives (read-only now, schema later)
- **Phase 1 (this build):** derive purely — `nextTouchDue = max(lastTouchDate, lastContactDate) + interval`. No new DB column. Recomputed on every render from existing `meetings` + `companies.last_contact_date`. Zero schema risk.
- **Phase 2 (optional, later):** persist `last_human_touch` + `next_touch_due`
  on `companies` so it survives manual edits; not required for v1.

### 1.3 UI additions to `/retention`
1. **"Due for touch" queue** — a pinned section above the cards, listing
   active_customer accounts where `today >= nextTouchDue`, sorted by
   overdue-days desc. Each row: name, tier, days overdue, and a one-tap
   "Log touch" that opens the Log modal pre-linked (same as today's button).
2. **Per-card "next touch" chip** — under the name: "Touch due in 12d" /
   "Overdue 5d" / "Due today". Resets to "Due in NNd" after you log a touch
   (because `last_contact_date` updates via CrmProvider → nextTouchDue moves).
3. **Filter pill: "Due"** — shows only accounts whose touch is due/overdue.

### 1.4 Acceptance (cadence)
- Only `active_customer` rows ever appear in Due queue or reward pool.
- `nextTouchDue` computed from `max(lastTouch, lastContactDate) + interval`;
  logging a touch moves it out of "Due" on refresh.
- No new DB table/column in Phase 1; `npm run build` green; `/retention` 200.

---

## 2. Intermittent Reward System (variable-ratio, not "every 3rd")

**Idea (Pat):** randomizer reward — *intermittent reinforcement* keeps the
client hooked because the reward is unpredictable (variable-ratio schedule,
the strongest behavioral hook). "Every 3rd order" is rejected: it's expected,
gets priced in, and loses novelty.

### 2.1 Design
- A **reward is *eligible* on a touch**, but is *granted by a random draw*,
  not guaranteed. Only active_customer accounts in the reward pool.
- **Trigger points (when the draw happens):**
  - On a logged win-back/check-in touch for a `watch`/`at_risk`/`dormant`
    account (re-activation surprise).
  - On a *milestone* (NOT fixed cadence): e.g. account's Nth order where N is
    a "lucky" number we pick (5, 10, 25…) — but the reward *type* is still
    randomized so it stays fresh.
- **Reward pool (Thai B2B butter context, solo-friendly, low margin hit):**
  - Free sample of a *new* product line (gelato base / bread mix) — cross-sell
    disguised as a gift.
  - Free 1kg butter on next order.
  - Handwritten note / LINE voice message from Pat ("thinking of your kitchen").
  - Priority restock / free delivery slot.
  - Recipe or plating idea PDF for their chef.
- **Randomizer:** weighted draw (not uniform) so high-value surprises are rarer.
  Implemented as a pure function `pickReward(rng, account)` → returns a reward
  descriptor OR `null` (no reward this time). `null` results are fine — the
  *possibility* is the hook.

### 2.2 Anti-pattern guardrails (bake into the plan)
- NEVER "every Nth order auto-gift" — that's the rejected model.
- Rewards are **surprise**, delivered via the human touch (LINE/visit), never
  advertised in advance.
- Solo margin cap: reward value ≤ small fixed ฿ ceiling; samples double as
  cross-sell, so they pay back.
- Each granted reward is logged as a `meeting` row (type `note` or a new
  `reward` type) so it's auditable and the draw history is visible.

### 2.3 UI additions
1. **"Reward eligible" badge** on a card when the account is in a
   reward-trigger state (win-back touch done / milestone hit).
2. **Reward drawer/modal** — when you log a touch that triggers a draw, show
   "🎁 Surprise reward for {name}: {rewardOrNone}". If `null`, show
   "No reward this time — but they'll remember the call." Keeps the
   intermittent feel honest.
3. Reward history on the Company detail (read-only list of past rewards).

### 2.4 Acceptance (rewards)
- Draw is called only for `active_customer` accounts.
- `pickReward` is a pure, testable function; returns reward OR null by RNG.
- Granted rewards written to the activity/meeting log; visible in history.
- No "every 3rd" logic anywhere.

---

## 3. Files touched (planned)
- `src/utils/retentionCadence.ts` (NEW) — `nextTouchDue()`, `TIER_INTERVAL`,
  `pickReward()` pure functions. Unit-checkable against known dates.
- `src/app/retention/page.tsx` — add Due queue, next-touch chip, Due filter,
  reward badge + reward modal hook.
- `src/components/CompanyDetail.tsx` — reward history (read-only).
- (Later, optional) `supabase/migrations/..._add_touch_dates.sql` — persist
  `last_human_touch` / `next_touch_due` + `reward` meeting type.

## 4. Out of scope (this plan)
- Standing-order discount logic (separate lever; noted earlier).
- Volume rebate tiers (enterprise-scale; not solo-sized yet).
- The sales-CSV pipeline (already prepped; unlocks M, not cadence).

## 5. Open decisions for Pat (recommendations given)
1. Reward draw trigger: recommend **win-back touch + milestones** (above).
2. Reward ceiling ฿ amount — recommend a small fixed cap (e.g. ≤ ฿300 equiv).
3. Persist touch dates now or Phase 2? Recommend **Phase 1 read-only derive**,
   persist later only if manual edits need it.

---

## 6. Phase 2 — Persist touch dates + log rewards (BUILT 2026-08-22)
Pat approved: "Persist touch dates and log the rewards."

**Schema migration:** `supabase/migrations/20260822_add_retention_touch_reward.sql`
- `companies.last_human_touch date`, `companies.next_touch_due date` (+ index).
- `meetings.type` CHECK extended to allow `'reward'`.
- **Manual step for Pat:** run this SQL in the Supabase dashboard SQL editor
  (no auto-DDL here). Until run, the app degrades gracefully: `updateCompany`
  with the new columns is caught (no crash) and dates fall back to derived.

**Code changes:**
- `src/types/crm.ts`: `MeetingType` + `MEETING_TYPE_LABELS` gain `'reward'`;
  `Company` gains `last_human_touch?` / `next_touch_due?`.
- `src/utils/retentionCadence.ts`: `nextTouchDue()` now PREFERS a persisted
  `next_touch_due` (source of truth) and falls back to deriving.
- `src/app/retention/page.tsx`: on a reward-triggering touch, after logging the
  interaction it (1) writes `last_human_touch = today` + recomputed
  `next_touch_due` via `crm.updateCompany`, and (2) inserts a `reward` meeting
  (auditable) when a reward is drawn; then refreshes.
- `src/components/CompanyDetail.tsx`: read-only "Rewards given" history section
  lists `meetings` where `type === 'reward'` for that company.

**Acceptance:** tsc clean, build green, `/retention` 200 live. Persistence
activates the moment the SQL migration is run (no further code deploy needed).

**Caveat:** reward draw is still intermittent (variable-ratio) — a touch may
log a `reward` meeting only when the weighted draw returns one; a `null`
outcome logs no reward (by design).
