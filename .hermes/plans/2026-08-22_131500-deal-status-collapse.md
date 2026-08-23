# Deal Status Collapse & Lost-Lane Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Remove the redundant top "Open / Won / Lost" toggle by making the Action Board the single writer of deal outcomes, and give "Lost" its own first-class lane (instead of being silently dumped into `parked`).

**Architecture:** `DealWorkflowAction` gains a `lost` lane. Outcome closure (`success` → Won, `lost` → Lost) is driven exclusively from the Action Lane. The top "Deal Status" control becomes a derived **Open / Done** indicator with a Reopen affordance only. `stage` stays the persisted sales-health signal (`closed_won` / `closed_lost`); the rest of the app already filters on `stage`, so no filter logic changes.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + Supabase. No component test runner is installed today (see Task 1).

---

## Current context / assumptions

- `DealStage`: `research | contacted | proposal | negotiation | closed_won | closed_lost`
- `DealWorkflowAction`: `outreach | reply | sample | testing | reschedule | parked | success`
- Smell #1: `success` lane AND a top "Won" button both set `closed_won` → double path to the same state.
- Smell #2: `getWorkflowAction()` maps `closed_lost` → `'parked'` (deal-workflow.ts:106). Lost deals masquerade as parked.
- Smell #3: `confirmLostSave()` persists `workflow_action: 'parked'` (DealDetail.tsx:240) — Lost is never represented in the workflow field.
- Mascot constraint (from memory): do **not** invent SVG/mascots. Reuse the existing approved `mascot-teardrop.png` for the `lost` lane.
- No Vitest/Jest/Playwright exists. Confirm flows, undo, and reopen already work via `crm.updateDeal` + `logActivity`.

## Design decision (please confirm)

Top control becomes **Open / Done**:
- `done = stage === 'closed_won' || stage === 'closed_lost'`.
- **Open** segment: dark/active when not done; when done, it becomes a tappable **Reopen** (restores `research` + `outreach`, existing logic).
- **Done** segment: shows `🎉 Won` or `📉 Lost` when closed; when open it shows a muted "Done" placeholder with helper text *"Mark done via Action Lane"*. It is **not** directly clickable to close — closure happens only in the Action Lane (Success or Lost), which is exactly the redundancy we're removing.
- Alternative if you'd rather keep a 2-button *editable* toggle: Done-when-open could drop into edit mode and pre-select the Success/Lost lane. Flagged as Open Question below.

## Proposed approach

1. Add `lost` to `DealWorkflowAction` and define its lane, mapping, mascot, and next-step.
2. Fix `getWorkflowAction` so `closed_lost → 'lost'` (not `'parked'`).
3. Make `persistSave` / `confirmLostSave` / `CreateModal` / `deals/page.tsx` all set `workflow_action: 'lost'` + `stage: 'closed_lost'` consistently.
4. Collapse the top status toggle to a derived Open/Done indicator + Reopen.
5. Verify with a unit test on the pure workflow logic + `next build` + manual smoke.

---

## Task 1: Add a minimal Vitest setup for pure-logic tests

**Objective:** Enable fast unit tests on `deal-workflow.ts` (the riskiest pure logic).

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add `dev` + `test` script + `vitest` devDep)

**Step 1: Create vitest config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

**Step 2: Add devDep + script**

In `package.json`, add to `devDependencies`: `"vitest": "^2.1.0"` and a script `"test": "vitest run"`.

**Step 3: Install**

Run: `cd /Users/pat/Projects/LeadPulse && npm install`
Expected: installs without error.

> **If you do NOT want a test runner:** skip this task and replace every "run test" step below with `npm run build` + manual verification. The logic is still correct; you just lose the automated guardrail.

---

## Task 2: Add `lost` to the `DealWorkflowAction` union

**Objective:** Introduce the lost lane at the type level.

**Files:**
- Modify: `src/types/crm.ts:57-64`

**Step 1: Add the union member**

Change:
```ts
export type DealWorkflowAction =
  | 'outreach'
  | 'reply'
  | 'sample'
  | 'testing'
  | 'reschedule'
  | 'parked'
  | 'success';
```
to:
```ts
export type DealWorkflowAction =
  | 'outreach'
  | 'reply'
  | 'sample'
  | 'testing'
  | 'reschedule'
  | 'parked'
  | 'success'
  | 'lost';
```

**Step 2: Type-check**

Run: `cd /Users/pat/Projects/LeadPulse && npx tsc --noEmit`
Expected: PASS (no new errors; `WORKFLOW_BY_ID` / `LANE_MASCOT_PATHS` will error until Task 3 fills them — that's expected and fixed next task).

**Step 3: Commit**

```bash
git add src/types/crm.ts
git commit -m "feat(types): add 'lost' deal workflow action"
```

---

## Task 3: Define the `lost` lane + mappings in `deal-workflow.ts`

**Objective:** Register the lost lane everywhere the workflow graph is described.

**Files:**
- Modify: `src/utils/deal-workflow.ts` (lines 65-73 lane list, 80-88 mascots, 103-111 getWorkflowAction, 122-130 STAGE_FROM_WORKFLOW, 150-158 NEXT_WORKFLOW)

**Step 1: Write failing test**

Create `src/utils/deal-workflow.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getWorkflowAction, STAGE_FROM_WORKFLOW, canNudge, NEXT_WORKFLOW, stageFromWorkflow, WORKFLOW_BY_ID } from './deal-workflow';
import type { Deal } from '@/types/crm';

const baseDeal = { id: '1', title: 'x', stage: 'research', product: 'Butter', client: 'C', company_id: null, contact_ids: [], value: null, priority: 'medium', next_action: null, followup_date: null, last_outcome: null, nudge_count: 0, created_at: '', updated_at: '' } as unknown as Deal;

describe('lost lane', () => {
  it('maps a closed_lost stage (no workflow_action) to lost', () => {
    expect(getWorkflowAction({ ...baseDeal, stage: 'closed_lost' })).toBe('lost');
  });
  it('maps lost workflow to closed_lost stage', () => {
    expect(STAGE_FROM_WORKFLOW.lost).toBe('closed_lost');
    expect(stageFromWorkflow('lost')).toBe('closed_lost');
  });
  it('lost is not nudgeable and loops on itself', () => {
    expect(canNudge('lost')).toBe(false);
    expect(NEXT_WORKFLOW.lost).toBe('lost');
  });
  it('still exposes a lost lane definition', () => {
    expect(WORKFLOW_BY_ID.lost.label).toBe('Deal lost');
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd /Users/pat/Projects/LeadPulse && npx vitest run src/utils/deal-workflow.test.ts`
Expected: FAIL (`WORKFLOW_BY_ID.lost` undefined, `getWorkflowAction` returns `'parked'`).

**Step 3: Add the lane to `WORKFLOW_LANES`** (after the `success` entry, ~line 72):
```ts
  {
    id: 'lost',
    icon: '📉',
    label: 'Deal lost',
    shortLabel: 'Lost',
    description: 'Closed without a sale. Removed from the active board.',
    className: 'border-clay-error/30 bg-clay-error/10',
  },
```

**Step 4: Add mascot** (LANE_MASCOT_PATHS, ~line 87):
```ts
  success: '/assets/mascots/mascot-won-trophy.png',
  lost: '/assets/mascots/mascot-teardrop.png',
```

**Step 5: Fix `getWorkflowAction`** (line 105-106):
```ts
  if (deal.stage === 'closed_won') return 'success';
  if (deal.stage === 'closed_lost') return 'lost'; // lost is its own lane (was 'parked')
```

**Step 6: Add stage mapping** (STAGE_FROM_WORKFLOW, after `success`):
```ts
  success: 'closed_won',
  lost: 'closed_lost',
```

**Step 7: Add next-step mapping** (NEXT_WORKFLOW, after `success`):
```ts
  success: 'success',
  lost: 'lost',
```

**Step 8: Run test to verify pass**

Run: `npx vitest run src/utils/deal-workflow.test.ts`
Expected: PASS (4 tests).

**Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 10: Commit**

```bash
git add src/utils/deal-workflow.ts src/utils/deal-workflow.test.ts
git commit -m "feat(workflow): add first-class 'lost' lane with mappings + tests"
```

---

## Task 4: Drive `lost` closure consistently in `DealDetail.tsx`

**Objective:** Selecting the Lost lane (or marking lost) sets `workflow_action: 'lost'` + `stage: 'closed_lost'`, and the top status becomes a derived Open/Done indicator.

**Files:**
- Modify: `src/components/DealDetail.tsx` (lines 47-49, 106-117, 182-229, 231-258, 314-338)

**Step 1: Derive `done`** (replace lines 47-49):
```ts
  const isWon = deal.stage === 'closed_won';
  const isLost = deal.stage === 'closed_lost';
  const done = isWon || isLost;
```

**Step 2: Make `persistSave` close on `lost`** (replace lines 106-117 block):
```ts
    const actionToSave: DealWorkflowAction = editData.workflow_action;
    const workflow = WORKFLOW_BY_ID[actionToSave];
    let newStage = editData.stage;
    let newFollowup = editData.followup_date;

    // Terminal lanes close the deal automatically. All other lanes stay
    // separate from the sales stage on purpose.
    if (actionToSave === 'success') {
      newStage = 'closed_won';
      newFollowup = '';
    } else if (actionToSave === 'lost') {
      newStage = 'closed_lost';
      newFollowup = '';
    }
```

**Step 3: Trigger Lost confirm from the lane** (replace `handleSave`, lines 182-193):
```ts
  const handleSave = () => {
    setError(null);
    if ((editData.workflow_action === 'success' || editData.stage === 'closed_won') && currentWorkflow !== 'success') {
      setConfirmSuccess(true);
      return;
    }
    if ((editData.workflow_action === 'lost' || editData.stage === 'closed_lost') && currentWorkflow !== 'lost') {
      setConfirmLost(true);
      return;
    }
    persistSave();
  };
```

**Step 4: Collapse `handleStatusChange` to Reopen only** (replace lines 196-229):
```ts
  // Deal Status is now a derived Open/Done indicator. The only status
  // action is reopening a closed deal (Done -> Open).
  const handleReopen = () => {
    if (!done) return;
    const before = beforeSnapshot();
    setSaving(true);
    crm.updateDeal(deal.id, { stage: 'research', followup_date: new Date().toISOString().split('T')[0], workflow_action: 'outreach' })
      .then(() => {
        setUndoSnapshot(before);
        logActivity({
          type: 'edit',
          entity: 'deal',
          entityId: deal.id,
          label: `Reopened ${dealClientName(deal, companies, contacts)}`,
          description: `${dealClientName(deal, companies, contacts)} moved back to open pipeline`,
          undoPayload: before,
        });
        onSaved();
        addToast('Deal reopened');
      })
      .catch(err => setError('Could not reopen: ' + (err.message || 'Unknown error')))
      .finally(() => setSaving(false));
  };
```

**Step 5: Persist `lost` (not `parked`) in `confirmLostSave`** (lines 237-241):
```ts
      await crm.updateDeal(deal.id, {
        stage: 'closed_lost',
        followup_date: null,
        workflow_action: 'lost',
      });
```

**Step 6: Replace the status section JSX** (lines 314-338) with the derived Open/Done control:
```tsx
          {/* Deal status: derived Open / Done — outcomes live in the Action Lane */}
          <section className="rounded-xl border border-clay-hairline bg-clay-surface p-3">
            <p className="text-[10px] font-semibold tracking-wider text-clay-muted mb-2">DEAL STATUS</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleReopen}
                disabled={saving || !done}
                className={clsx(
                  'px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50',
                  !done
                    ? 'bg-clay-ink text-clay-canvas border-clay-ink'
                    : 'bg-white dark:bg-clay-card text-clay-muted border-clay-hairline active:bg-clay-surface'
                )}
              >
                ● Open
              </button>
              <div className={clsx(
                'px-3 py-2.5 rounded-lg text-sm font-medium border text-center',
                done
                  ? isWon ? 'bg-clay-mint/20 border-clay-mint text-clay-teal' : 'bg-clay-error/10 border-clay-error text-clay-error'
                  : 'bg-white dark:bg-clay-card text-clay-muted border-clay-hairline'
              )}>
                {done ? (isWon ? '🎉 Won' : '📉 Lost') : 'Done'}
              </div>
            </div>
            {done && <p className="text-xs text-clay-muted-soft mt-2">Tap <span className="font-medium">Open</span> to reopen. To mark a deal done, use the Action Lane below (Success 🎉 or Lost 📉).</p>}
          </section>
```

**Step 7: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS, no type errors, build succeeds.

**Step 8: Commit**

```bash
git add src/components/DealDetail.tsx
git commit -m "refactor(deal-detail): derive Open/Done status; route Lost through 'lost' lane"
```

---

## Task 5: Mirror `lost` closure in `CreateModal.tsx`

**Objective:** Creating a deal directly in the Lost lane sets `closed_lost` (mirrors the existing `success` handling).

**Files:**
- Modify: `src/components/CreateModal.tsx` (lines 87-91)

**Step 1: Add lost handling in `handleWorkflowChange`**
```ts
      // "Successful" is a real outcome — it closes the deal, like the detail drawer does.
      if (lane === 'success') {
        next.stage = 'closed_won';
        next.followup_date = '';
      }
      // "Lost" is a real outcome — closes the deal as lost.
      if (lane === 'lost') {
        next.stage = 'closed_lost';
        next.followup_date = '';
      }
```

**Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/components/CreateModal.tsx
git commit -m "feat(create-modal): close deal as lost when Lost lane selected"
```

---

## Task 6: Mirror `lost` closure in the deals board log path

**Objective:** Logging an interaction that lands on the `lost` lane closes the deal as lost (mirrors `success` at deals/page.tsx:201).

**Files:**
- Modify: `src/app/deals/page.tsx` (lines 201-204)

**Step 1: Add lost branch**
```ts
    if (target === 'success') {
      updates.stage = 'closed_won';
      updates.followup_date = null;
    }
    if (target === 'lost') {
      updates.stage = 'closed_lost';
      updates.followup_date = null;
    }
```

**Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/app/deals/page.tsx
git commit -m "feat(deals-board): close deal as lost when Lost lane logged"
```

---

## Task 7: Full build + lint + manual smoke test

**Objective:** Prove the whole app still compiles and the redundant control is gone.

**Files:** none (verification only)

**Step 1: Build**
Run: `cd /Users/pat/Projects/LeadPulse && npm run build`
Expected: Next build completes with no errors.

**Step 2: Lint**
Run: `npm run lint`
Expected: no new errors (pre-existing warnings are fine).

**Step 3: Run unit tests**
Run: `npx vitest run`
Expected: all pass.

**Step 4: Manual smoke (dev server)**
Run: `npm run dev`, then in the browser:
1. Open any active deal → top shows **● Open** (dark) + muted **Done**.
2. Edit → set Action Lane to **🎉 Deal successful** → Save → confirm "Mark this deal successful?" → deal moves to Won; top now shows **🎉 Won**, Open is tappable to reopen.
3. Reopen → then edit → set Action Lane to **📉 Deal lost** → Save → confirm "Mark this deal lost?" → deal shows **📉 Lost**, `workflow_action` is `lost` (verify in Supabase or Activity feed, not `parked`).
4. Create a new deal with Action Lane = Lost → saves as `closed_lost`.
5. Confirm no `Won`/`Lost` buttons remain in the top status control.

**Step 5: Commit (if any fixes were needed)**
```bash
git add -A
git commit -m "chore: post-verification fixes for deal status collapse"
```

---

## Files likely to change
- `src/types/crm.ts` — `DealWorkflowAction` union
- `src/utils/deal-workflow.ts` — lane, mascot, mappings, `getWorkflowAction`
- `src/utils/deal-workflow.test.ts` — **new** unit tests
- `src/components/DealDetail.tsx` — status collapse + lost persistence
- `src/components/CreateModal.tsx` — lost-at-creation
- `src/app/deals/page.tsx` — lost-at-log
- `vitest.config.ts` — **new** (Task 1)
- `package.json` — vitest devDep + test script

## Risks, tradeoffs, open questions
- **Test runner added:** repo had none. Task 1 is the only infra change; skip it if you prefer manual-only verification (noted in Task 1).
- **Existing `closed_lost` deals flip from `parked` to `lost` lane** on next read (via `getWorkflowAction`). This is the intended fix; their `workflow_action` column stays `null` in DB until next save, but the UI now shows "Lost" correctly. No migration needed.
- **`Done`-when-open is a non-clickable placeholder.** It intentionally cannot close a deal (closure is the Action Lane's job). If you'd rather the top control be a fully editable 2-button toggle where Done-when-open drops into edit mode pre-selecting Success/Lost, say so and I'll adjust Task 4 Step 6.
- **Mascot:** reused `mascot-teardrop.png` for `lost` (no dedicated lost mascot exists; memory forbids inventing one). Swap to a dedicated asset later if you commission one.
- **Filters untouched:** every `stage === 'closed_lost'` filter still works because we keep the `closed_lost` stage. Only the `workflow_action` value changes (`parked` → `lost`).
