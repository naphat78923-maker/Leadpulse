# LeadPulse Clay Editorial Action Sheet

> **Status:** Draft, awaiting Pat sign-off
> **Date:** 2026-08-31
> **Design source:** `.hermes/design-briefs/leadpulse-clay-editorial-action-sheet.json`
> **Workspace note:** Current `main` has 18 modified tracked files. This plan is scoped to **new files only** plus one controlled wiring change. It does not touch the existing Deal board, detail panels, CrmProvider, or lane logic.

## Goal

Replace the jarring, mascot-heavy empty-state surface on `/` (Today) with a calm, illustrated "choose your next sales action" sheet that reuses LeadPulse's fixed clay PNG mascots in a disciplined, editorial way.

The sheet follows the mobile pattern from Pat's screenshot:

1. Dim the CRM behind it
2. Show a warm paper bottom sheet
3. One editorial serif question
4. Three action cards, each with **one existing mascot** and a pale accent
5. Each card routes to an **existing explicit workflow** (no new writes, no auto-state-change)

## In scope

| File | Action | Notes |
|------|--------|-------|
| `src/components/TaskActionSheet.tsx` | **Create** | New presentational component |
| `src/components/TaskActionSheet.test.tsx` | **Create** | Behavior + accessibility tests |
| `src/app/page.tsx` | **Modify** | Replace the existing action-queue empty-state block's empty case with the sheet trigger |

## Out of scope

- No new mascot generation, no AI clay art, no human avatars
- No Deal board, lane, pipeline-stage, or action-board changes
- No CrmProvider, auth, RLS, data layer, or Supabase changes
- No dense CRM tables, filters, or inline editing
- No global type/token/route refactor

## Component spec — `TaskActionSheet`

### Props

```ts
interface TaskActionSheetProps {
  open: boolean;
  onClose: () => void;
  onFollowUp: () => void;   // scroll/open Today action queue
  onNewLead: () => void;    // open existing CreateModal(type='contact')
  onLogTouch: () => void;   // open existing LogInteractionModal
}
```

### Layout & tokens

- Backdrop: `bg-black/50`, closes sheet on click
- Sheet: `bg-white dark:bg-clay-card`, `rounded-t-2xl` mobile, centered dialog desktop, `max-width 520px`
- Use existing tokens only: `clay-canvas`, `clay-card`, `clay-surface`, `clay-ink`, `clay-body`, `clay-hairline`, `clay-lavender`, `clay-mint`, `clay-ochre`
- Eyebrow: Martian Mono, `10px`, `0.12em` tracking
- Headline: Lustria, `32px`, `-0.025em` tracking, only this one serif use
- Card title: DM Sans `16px` 700
- Card description: DM Sans `14px` 400
- Mascot: `MascotSprite`, `92px`, one per card, alt text matches the action

### Three cards

| ID | Title | Description | Mascot | Accent |
|----|-------|-------------|--------|--------|
| `follow_up` | Follow up with someone | See who needs a touch today | `mascot-followup.png` | mint 12% |
| `new_lead` | Add a new lead | Capture a company or contact before you forget | `mascot-outreach.png` | lavender 12% |
| `log_touch` | Log a touch | Save a call, email, DM, or meeting | `mascot-reply.png` | ochre 12% |

### Behavior

- Entire card is one `<button>`, no nested controls
- Enter/Space activates, visible focus ring on the sheet
- `Escape` closes, focus returns to trigger on close
- Clicking backdrop closes
- No mutation fires until the user reaches the explicit Save step inside the opened workflow

### Motion

- Backdrop opacity `160ms`
- Sheet `translateY(16px) + opacity` ease-out `220ms`
- Pressed card `scale(0.98)` for `110ms`
- Mascot: fade-in on sheet open, no bounce, no loop
- `prefers-reduced-motion`: instant, no transforms

## Wiring — `src/app/page.tsx`

Replace the existing "Action queue empty" block with a single `TaskActionSheet` instance driven by a new `startOpen` state, opened by an explicit "Start a task" button visible only when `actionQueue.length === 0`.

The button and the sheet are the only additions. The rest of Today stays untouched.

## Acceptance criteria

- [x] Design brief `.hermes/design-briefs/leadpulse-clay-editorial-action-sheet.json` reviewed
- [ ] Pat approves this plan before implementation starts
- [ ] `TaskActionSheet` renders three cards with the correct mascots, copy, and accents
- [ ] Tests cover: open/close, Escape, backdrop click, three actions fire their callbacks, no nested buttons, focus management, accessible names
- [ ] Sheet opens only when Today's action queue is empty
- [ ] Choosing a card opens an existing workflow; no Save happens until the user confirms
- [ ] Dark mode uses existing night-desk tokens, no pasted bright white
- [ ] `npx tsc --noEmit` clean
- [ ] `npm test` clean
- [ ] `npm run build` clean
- [ ] No Deal board, lane rule, CrmProvider, or mascot asset changed

## Delivery order

1. Write this plan, get Pat sign-off
2. Create `TaskActionSheet.tsx` + `TaskActionSheet.test.tsx`
3. Wire the empty-state trigger in `page.tsx`
4. Run `tsc` → `test` → `build`
5. Report what real execution returned, stop for visual approval before any deploy

## Workspace safety

Current `main` is dirty with overlapping Deals/Contacts/Companies/detail-panel work. Implementation should happen on a dedicated branch or worktree that starts from a reviewed baseline commit, not layered on the current dirty tree. The plan touches only new files + the one Today empty-state block to keep the change reviewable and reversible.
