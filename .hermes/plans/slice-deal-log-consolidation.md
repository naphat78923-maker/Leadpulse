# LeadPulse — Deal Log & Stage Consolidation Plan

> **Superseded on 2026-08-25:** interaction logs now keep the current action lane by default. A forward lane is applied only after an explicit, validated choice; no-response/outbound touches never imply a client reply. See `.hermes/plans/2026-08-25_190822-safe-interactions-do-now.md`.

**Goal (from Pat, 2026-08-21):** (1) deals should NOT have a separate manual pipeline stage —
it must be driven by logged interactions; (2) Log Interaction is bloated and double-logs data;
(3) nudge stage only applies at/after the sample-sent stage.

## Principle
The **interaction log is the single source of truth** for a deal's state. Logging an interaction
against a deal advances its workflow lane in the *same* save — no second UI, no second write.

## Proposed changes

### A. Stage becomes derived (no manual picker)
- Remove the "Pipeline stage" `<select>` from DealDetail and the Stage `<select>` from CreateModal
  (deal defaults to `research` on create).
- Add `stageFromWorkflow(action)` in `deal-workflow.ts`:
  outreach→research, reply→contacted, sample→proposal, testing→negotiation,
  success→closed_won, reschedule/parked→keep current stage (cadence only).
- Whenever a deal's `workflow_action` is set (via log or action lane), also write the derived
  `stage` so both boards stay consistent. `/deals` already groups by workflow lane; `/pipeline`
  groups by stage (now auto-synced). Existing `getWorkflowAction` (stage→action) stays for legacy rows.

### B. Log Interaction de-bloated → ONE smart modal
Current 7 meeting-types + separate nudge + separate stage changes = double logging.
New "Log" modal (one button, per Pat's "one button (or 2 as you see fit)"):
  1. Type: Call / Email / DM / Meeting / Note (5 — drop standalone Sample/Nudge types; they are
     workflow steps now, not meeting logs).
  2. Description * (what happened).
  3. Outcome: Positive / Neutral / Negative / No response (sentiment — feeds deal health).
  4. Linked Deal (optional) → if linked, show "Move deal to:" = next workflow lane
     (Outreach → Client reply → Sample → Testing → Won). One save = one interaction + one state change.
  5. Schedule follow-up date (optional).
  6. Linked contacts (auto-suggested from the linked deal's company).
- Removes: redundant Product field (lives on deal), separate nudge picker (moved to action lane),
  separate stage change (moved into #4).

### C. Nudge gating (post-sample only)
- In DealDetail's action-lane picker, only show `reschedule`/`parked` (the nudge-bearing lanes)
  when `workflow_action` is `sample` or later (testing / negotiation / success).
- Earlier stages (outreach / reply) get NO nudge option — matches "nudge only after sent samples
  stages and after".
- Nudge stage is set only inside the reschedule lane (one place), never in the log modal.

## Files touched
- `src/utils/deal-workflow.ts` (add stageFromWorkflow; gate nudge lanes)
- `src/components/DealDetail.tsx` (remove stage select; gate nudge lanes; log advances state)
- `src/components/CreateModal.tsx` (remove Stage select for deal)
- `src/components/LogInteractionModal.tsx` (de-bloat to 5 types + linked-deal advance)
- `src/utils/quickActions.ts` (align stage→workflow; mark Sample/Nudge as workflow, not meetings)
- `src/app/pipeline/page.tsx` (group by workflow_action instead of stage, or keep stage auto-synced)

## Verification
- `npx tsc --noEmit` clean, `npm run build` green, deploy, manual: log an interaction on a deal and
  confirm its lane + stage advance together with no duplicate activity entry.
