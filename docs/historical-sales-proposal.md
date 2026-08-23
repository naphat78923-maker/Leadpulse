# Historical Sales → LeadPulse Recommendations

> Status: **Proposal approved for Phase 1 drafting.** Inspection complete. No production
> data modified. Auto fuzzy-match mapping + collapsed Home card chosen by Pat.

## Product principle
Historical data should determine what deserves attention **today**, not compete with
today's work. The existing current-activity workflow (Home → Action queue) is the
primary focus and must stay protected.

---

## 1. Data readiness (concise)

**Available & reliable**
- Customers (normalized): `customers` table, 47 rows. Name drift already merged
  (Veganerie, Nutra, Crema, I Made Bakery).
- Orders / invoices: `sales.document_no`, unique across all 4 years.
- Dates: `sales.date`, clean.
- Net sales (THB): `amount_thb` / `signed_amount`. Credit notes correctly negative.

**Partially available**
- Cancellations / returns: only as separate `Credit Note` rows, **not linked** to the
  original invoice → cannot model "returned X%".
- Seasonality: derivable from order months, but 2026 is partial → weak for now.

**Absent (limits signals)**
- **Products** and **quantities**: invoice-level only. The "complementary product"
  signal cannot be derived from history; deferred to Phase 4 (CRM-only, uses `deals.product`).

**Top risks → misleading recommendations**
1. Historical `customers` is **not linked** to CRM `companies` (same DB, separate
   tables, no FK). ~Half of historical buyers aren't in the CRM yet.
2. Thin-history customers (22/47 have <3 orders or <90d span) → per-customer rhythm
   unreliable. Must be gated out.
3. No product/quantity → deprioritizes complementary-product signal.

---

## 2. Prioritized CRM signals

| # | Signal | Actionable | Ready | Phase |
|---|---|---|---|---|
| **1** | **Overdue vs own reorder rhythm** | ✅ | ✅ | **Phase 1 (build)** |
| 2 | Dormant former high-value account | ✅ | ✅ (no rhythm needed) | Phase 2 |
| 3 | Approaching seasonal reorder window | ✅ | ⚠️ needs more years | Phase 3 |
| 4 | Account growing/declining unusually | ⚠️ | ✅ | Phase 3 |
| 5 | Complementary product ready | ✅ but **data absent** | ❌ | Phase 4 (CRM-only) |
| — | Vanity (total revenue, order count) | ❌ | — | none |

Phase 1 ships **only Signal 1, capped at 5 recommendations.**

---

## 3. Information architecture (3 layers, quiet)

```
HOME  (existing — PROTECTED as primary focus)
  • Today's plan · Due today · This week · Action queue
  • [NEW] "Buying signals" card — collapsed, max 5, sits BELOW the queue.
    Never adds rows to the Action queue (no crowding).

CUSTOMER / COMPANY PAGE  (existing)
  • [NEW] "Buying pattern" mini-block + "Suggested next action" line.

ANALYTICS  (existing — separate from daily ops)
  • [NEW tab] "4-year history" — deep exploration only; never on Home.
```

---

## 4. Exact logic — first signal (the one to prove)

**Eligibility (per-customer, NOT universal):**
```
QUALIFIES if:
  order_count(customer) >= 3
  AND span_days(first, last) >= 90
  AND is_intercompany = false
  AND all orders is_zero_value = false
```
(25 of 47 customers qualify — proven against real data.)

**Per-customer rhythm:**
```
gaps        = sorted diffs between consecutive order dates
median_gap  = median(gaps)            # robust to one weird gap
typical_val = median(amount_thb)
```

**Overdue test (today = 2026-08-22):**
```
days_since_last = today - last_order_date
threshold       = max(21, round(median_gap * 1.5))   # 1.5× own rhythm, 21d floor
IS_OVERDUE if days_since_last > threshold
severity_days  = days_since_last - median_gap
```

**Output (matches the requested example):**
> **Central Food Retail may be due for a follow-up.** Usually reorders every ~131 days.
> Last order was 457 days ago. Typical order value ฿48,715.
> *Suggested action: check current stock and ask about the next delivery.*

**Ranking for ≤5 cap:** `severity_days × typical_value` (commercial weight).

### Proof on real 4-year sales (top of Phase-1 list)
| Customer | n | median gap | days since | typical ฿ | overdue? |
|---|---|---|---|---|---|
| Central Food Retail (FDC) | 7 | 131d | 457d | 48,715 | ✅ |
| Million Foods | 7 | 52d | 529d | 6,574 | ✅ |
| Aleenta Resort Phang Nga | 13 | 50d | 501d | 3,638 | ✅ |
| Broccoli Revolution | 8 | 66d | 393d | 1,696 | ✅ |
| Vistro | 31 | 40d | 11d | 5,619 | ❌ (correctly NOT flagged) |

**Vistro note:** CRM seed says "last contact 1,144 days ago" (stale), but sales history
shows an order **11 days ago** — the history *quietly corrects* the CRM's stale view.
This is the product principle working.

---

## 5. Risks & false-positive controls

| Risk | Control |
|---|---|
| Recently contacted → duplicate nag | Suppress if a `meetings` row for the linked company exists within `max(30, median_gap)` days |
| Already in today's Action queue | Suppress any customer with an open deal (not closed) — never double-surface |
| New account, few orders | Eligibility gate (≥3 orders, ≥90d span) removes 22/47 |
| One freak gap skews rhythm | `median`, not mean; 1.5× multiplier gives slack |
| Intercompany (Crema) noise | Filtered out (`is_intercompany=false`) |
| Partial 2026 skews seasonality | Seasonality deferred to Phase 3 |
| Buyer not in CRM | Show "not yet in CRM — add as a company" instead of "follow up" |
| Recommendation fatigue | Hard cap **5**; collapsed card; **Dismiss** (permanent) + **Snooze 30d** |

---

## 6. Phased implementation + acceptance criteria

**Phase 1 — ONE signal, prove it**
1. `customer_link` table: `historical_customer_id → crm_company_id (nullable)` +
   `match_confidence` + `reviewed`. Seeded by **auto fuzzy-match** (pg_trgm), ~80% accurate,
   needs a manual review pass.
2. Read-only view `reorder_signals` (eligibility + rhythm + overdue) over `sales`⋈`customer_link`.
3. Home: collapsed "Buying signals" card, ≤5, evidence line + Dismiss/Snooze.
4. Company page: "Buying pattern" + "Suggested next action" block.

**Acceptance criteria (Phase 1 must pass before Phase 2):**
- ✅ Recommendations match the verified list (Central Food Retail, Million Foods, Aleenta,
  Broccoli flagged; Vistro + recent buyers NOT flagged) on current data.
- ✅ Zero recommendations duplicate an Action-queue item or a contact within suppression window.
- ✅ Card shows ≤5 and is collapsed below the Action queue on Home.
- ✅ Dismiss persists; Snooze hides 30d.
- ✅ **Pat judges it genuinely useful over 2–3 weeks** → only then build Signal 2.

---

## 7. Decisions (Pat, 2026-08-22)
- **Mapping:** auto fuzzy-match historical `customers` → CRM `companies` by name (needs review pass).
- **Placement:** collapsed Home card (protects Action queue).

## 8. Drafted artifacts (this repo)
- `supabase/migrations/20260822091500_historical_signals.sql` — `customer_link` + fuzzy seed + `reorder_signals` view.
- `src/lib/historical.ts` — `fetchReorderSignalRows()` + pure `getReorderSignals()` with app-side suppression + cap.
- `src/components/ReorderSignalsCard.tsx` — collapsed Home card.
- Wiring snippet (apply manually into `src/app/page.tsx`): see component header comment.
