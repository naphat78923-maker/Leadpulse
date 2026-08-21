# LeadPulse Visual & Mascot System — Implementation Spec

> Status: **DRAFT — ready for implementation review**
> Owner: Pat Hiranpruk · Maintainer: Jarvis
> Last grounded: 2026-08-21 (post-deploy of clay-desk + mascot-gap fix)
> Scope: The LeadPulse CRM is a brand-new system. This document is the single
> source of truth for the visual language and the mascot family so future
> features are built *on* a locked foundation instead of re-deriving it.

---

## 1. Purpose

LeadPulse is a mobile-first B2B butter-sales CRM. The interface should feel
like **a tiny clay sales desk working late at night** — warm, tactile, and
human, never a cold SaaS grid. This spec locks:

1. The clay-desk color/typography system (light + dark).
2. The **fixed claymation mascot FAMILY** — a reusable cast of characters,
   each with a job. New features reuse existing mascots; they never invent new
   ones without a documented decision.
3. The component contract for placing mascots (`MascotSprite`).
4. The current asset registry + known gaps to close during implementation.

---

## 2. Design Language — "Clay Desk"

| Axis | Rule |
|------|------|
| Surface | Rounded "clay slab" cards, soft inset shadows, no hard edges |
| Urgency | **Left-edge marker only.** Overdue = left red edge + chip. Never full-red boxes, never glowing danger panels |
| Danger color | Tomato red used **only** for true destructive/error states |
| Motion | Subtle: slide-up on cards, save spinner → green ring → toast |
| Texture | Matte, hand-made feel; dotted-grid canvas in dark mode |
| Density | Mobile-first; one lane/tab at a time on small screens |

---

## 3. Color Tokens (Tailwind v4 `@theme`, `src/app/globals.css`)

### Brand base
| Token | Light | Dark (midnight cocoa) | Role |
|-------|-------|----------------------|------|
| `--color-clay-canvas` | `#fdf6e9` warm paper | `#17120e` | App background |
| `--color-clay-surface` | `#faf5e8` | `#1e1915` | Sunken panels |
| `--color-clay-card` | `#f5f0e0` | `#262019` | Card slab |
| `--color-clay-hairline` | `#e5e5e5` | `#3a332b` | Borders/grid |
| `--color-clay-ink` | `#2b211a` | `#f6f3ea` | Headings |
| `--color-clay-body` | `#3f382f` | `#b9b3a4` | Body text |
| `--color-clay-muted` | `#6a6a6a` | `#9c9688` | Secondary text |

### Accents (clay-softened)
| Token | Value | Use |
|-------|-------|-----|
| `--color-clay-ochre` (`#eec35a`) | butter yellow | **Attention** (active lead, CTA highlight) |
| `--color-clay-lavender` (`#b8a4ed` / dark `#c4b0f0`) | grape | **Primary** actions |
| `--color-clay-mint` (`#7fc9a8`) | mint | **Progress** / done |
| `--color-clay-pink` `#d98ba8` · `--color-clay-peach` `#f2b48c` · `--color-clay-coral` `#e0766a` · `--color-clay-teal` `#2a5a5a` | decorative only |

### Semantic (tomato red = danger only)
| Token | Light | Dark | Meaning |
|-------|-------|------|---------|
| `--color-clay-success` | `#3daf7a` | (same) | Success |
| `--color-clay-warning` | `#eec35a` | (same) | Warning |
| `--color-clay-error` | `#d9543f` | (same) | **Danger / destructive only** |

### Zams legacy aliases (do not expand)
`--color-zams-violet #7b5cd6`, `--zams-deep #5a44a8`, `--zams-cobalt #4a7bb5`,
`--zams-powder #e8e0f7`. Kept for backwards-compat; prefer `clay-*` going forward.

---

## 4. Typography

| Role | Font | Notes |
|------|------|-------|
| Sans (UI) | **DM Sans** | All interface text |
| Display / serif | **Lustria** | Daily briefing, hero greetings only |
| Mono (metadata) | **Martian Mono** | Dates, IDs, counts, overdue stamps |

Set via `--font-sans` / `--font-display` in `@theme`. Mono used inline as utility.

---

## 5. Mascot Family (FIXED CAST)

All mascots are **claymation characters on a white grid floor, plain off-white
background, soft studio light, matte plasticine, kawaii chibi proportions**.
They are generated as **1024×1024 PNG** and placed through `MascotSprite`
(which crops to a square "clay shelf").

> **RULE:** reuse the existing cast. Do not invent new mascots for new features
> without updating this doc + the `deal-workflow.ts` map. Pat's standing
> direction: *"mascots have jobs, subtle, never jarring… reuse, never invent."*

### 5.1 Roster

| File | Character | Job / where used |
|------|-----------|------------------|
| `mascots/mascot-outreach.png` | Lavender crayon w/ magnifier | Log outreach · deal lane `outreach` |
| `mascots/mascot-reply.png` | Listener | Log client reply · lane `reply` |
| `mascots/mascot-sample.png` | Sample box | Mark sample sent/received · lane `sample` |
| `mascots/mascot-testing.png` | Tester | Set testing date · lane `testing` |
| `mascots/mascot-parked.png` | Sleepy | Park deal · lane `parked` · empty/sleepy states |
| `mascots/mascot-won-trophy.png` | Trophy hero | Deal won · lane `success` |
| `mascots/mascot-won-confetti.png` | Confetti hero | Deal won (random alt) |
| `mascots/mascot-teardrop.png` | **Lavender planner teardrop w/ clipboard+calendar** | **Today's Plan card**, reschedule lane `reschedule` |
| `mascots/mascot-followup.png` | **Mint teardrop w/ envelope + sparkle** | **Action queue header**, nudges/analytics reviewer |

### 5.2 Lane → mascot map (`src/utils/deal-workflow.ts`)
```ts
outreach:  '/assets/mascots/mascot-outreach.png',
reply:     '/assets/mascots/mascot-reply.png',
sample:    '/assets/mascots/mascot-sample.png',
testing:   '/assets/mascots/mascot-testing.png',
reschedule:'/assets/mascots/mascot-teardrop.png',
parked:    '/assets/mascots/mascot-parked.png',
success:   '/assets/mascots/mascot-won-trophy.png',
```
`followup` is **queue-only** (not a deal lane). `won-confetti` is chosen
randomly at render for variety.

### 5.3 Generation spec (for any future mascot)
- Route: **Google AI Studio Nano Banana** (`gemini-2.5-flash-image`) — cost-first default.
- Prompt template: *"3D claymation mascot of a [color] [shape] character with
  [face], holding [prop]. Matte plasticine, soft rounded edges, kawaii chibi
  proportions, white grid graph-paper floor, plain off-white background, soft
  diffused studio light, character centered with padding."*
- Output 1:1, 1024×1024 PNG. Verify no distorted text / extra limbs before install.
- Install to `public/assets/mascots/`. Update this doc + `deal-workflow.ts`.

---

## 6. Component Contract — `MascotSprite`

`src/components/MascotSprite.tsx` (do not fork; reuse everywhere):
```tsx
<MascotSprite src="/assets/mascots/mascot-followup.png" size={28} alt="Follow-up mascot" />
```
- `src` — path under `/public` (canonical: `/assets/mascots/*.png`).
- `size` — px square (default 24). Common: 18 (chip), 28 (queue header), 44 (section), 46 (hero).
- Renders a framed "clay shelf": light = `mix-blend-multiply` melts studio bg
  into warm shelf; dark = framed portrait on night desk w/ soft shadow.
- Uses `next/image` (1024×1024 intrinsic). Keep asset dims 1:1.

---

## 7. Asset Registry & Status (grounded 2026-08-21)

**Canonical location:** `public/assets/mascots/*.png` ✅ all 9 present & live 200.

**Legacy / inconsistent paths (CLEANUP NEEDED):**
The following still reference the **old top-level** `/assets/mascot-teardrop.png`
(not the `mascots/` folder). Both files currently exist and resolve, but the
split is a maintenance hazard:
- `src/app/page.tsx:146` (hero "LeadPulse mascot", size 46)
- `src/app/page.tsx:489` (empty/secondary state)
- `src/app/activity/page.tsx:432`
- `src/app/contacts/page.tsx:202`
- `src/app/deals/page.tsx:403`

**Other assets:**
- `public/assets/deal-lanes-hero.png` — deals board hero (referenced deals:360)
- `public/assets/mascot-teardrop.png` — LEGACY top-level; superseded by
  `mascots/mascot-teardrop.png`. Mark for deprecation.
- `public/assets/mascot-prompts.md` — generation prompts log (keep).

---

## 8. Known Gaps (from the "Today's Plan photo missing" incident)

1. **Missing-asset blindness.** A referenced mascot (`mascots/mascot-teardrop.png`)
   was 404 in prod for an unknown period with no build error. *Fix:* add a
   pre-deploy asset check (script asserts every `/assets/...` ref resolves to a
   file in `public/`).
2. **Path inconsistency** (§7) — consolidate to `/assets/mascots/*`.
3. **No `followup` lane mapping** — it lives only in queue headers; decide if it
   should be a deal lane or stay queue-only (recommend: queue-only).
4. **`won-confetti` vs `won-trophy`** random pick is fine but undocumented
   outside code — captured here.

---

## 9. Acceptance Criteria (implementation-ready)

- [ ] Every `/assets/...` reference in `src/**` resolves to a file in `public/`
      (enforced by pre-deploy check).
- [ ] All mascot refs use `/assets/mascots/*.png`; legacy top-level refs removed.
- [ ] New mascot additions update §5.1 + `deal-workflow.ts` + this doc.
- [ ] `MascotSprite` is the only mascot renderer (no raw `<img>`/`<Image>` for mascots).
- [ ] Dark-mode contrast passes (canvas `#17120e`, ink `#f6f3ea`) — night-desk mandatory.
- [ ] Save interactions use explicit save button + animation (not live-edit).

---

## 10. Next Actions (proposed, not started)

1. Add `scripts/check-assets.mjs` (assert refs exist) to `vercel --prod` prep.
2. Patch 5 legacy refs → `/assets/mascots/mascot-teardrop.png`.
3. Deprecate `public/assets/mascot-teardrop.png` after #2.
4. (Optional) Generate a dedicated `mascot-reschedule.png` if the planner
   teardrop reads wrong in the reschedule lane.
