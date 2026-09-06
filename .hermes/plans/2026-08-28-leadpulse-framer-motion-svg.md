# LeadPulse — Framer Motion + SVG animation layer

**Status:** Proposed plan. Awaiting Pat approval before build.
**Format:** Prioritized slices, acceptance criteria last.

## Design principles (must hold for every animation)

- **Calm + confident, never flashy.** Motion serves the brand (Tilda monochrome + coral, subtle).
- **Purposeful only.** Feedback, transitions, celebration. No decoration.
- **Mobile-first + low-end friendly.** Battery-aware; `prefers-reduced-motion` honored everywhere.
- **No noise in daily flow.** Animations on the Do-now board are subtle; wins get the burst.

---

## Slice 1 — Save & confirm feedback (highest ROI)

Target the explicit Save UX Pat loves. Make the feedback feel alive without changing the flow.

### Scope
- **Save button:** tapping Save shows a smooth spinner, then a coral success-ring pulse, then returns to idle — all inside the existing button using `AnimatePresence`.
- **Toast:** slide-up + auto-dismiss with a subtle scale, no layout shift.
- **Row success ring:** brief coral ring flash on the just-saved row (matches existing green-ring feedback).
- **Error shake:** subtle horizontal shake on validation failure (respects reduced-motion).

### Non-scope
- Changing the Save logic, snapshot/undo pipeline, or `updateDealIfUnchanged` concurrency guard. Animation only.
- Page-load animations.

### Approach
- Add `framer-motion` dependency (~40KB gzipped, fine for Next).
- Wrap existing button states with `m.button` + `AnimatePresence`.
- Use spring physics with low bounce (tension ~170, friction ~26) for calm feel.

### Acceptance
- Save tap → spinner → success ring → idle, each phase visible, total <600ms.
- No layout jank (icons swap with `AnimatePresence` `mode="popLayout"` or crossfade).
- `prefers-reduced-motion: reduce` → animations disabled, states still change (spinner becomes a static "Saving…").
- Tests + TypeScript + build pass before deploy approval.

---

## Slice 2 — Mascot upgrade (PNG → animated SVG)

Convert the existing mascot set to subtle, brand-aligned animated SVGs. Keep them small and calm — this is personality, not a cartoon show.

### Mascot set (from `public/assets/mascots/`, replace PNG with `components/mascots/*.tsx`)
- `mascot-followup` → gentle teardrop bob (one slow up/down cycle, repeats softly)
- `mascot-outreach` → line-drawn phone/megaphone, subtle send motion
- `mascot-parked` → static-line car with a slow "sleeping Z" blink (rare, calm)
- `mascot-reply` → message bubble with a gentle pulse
- `mascot-sample` → box with a subtle "unwrap" line draw on appear
- `mascot-teardrop` → single teardrop falling + settle (slow)
- `mascot-testing` → flask with a gentle bubble
- `mascot-won-trophy` → trophy line-draw on appear (one shot, on win)
- `mascot-won-confetti` → **replaced by Slice 3**

### Approach
- Build each as a self-contained React component (`src/components/mascots/<Name>.tsx`) using inline `<svg>` + `m.path` for line-drawing (`strokeDasharray`/`strokeDashoffset` animation).
- Coral accent color from existing design token (`clay-coral` or equivalent).
- Monochrome line art elsewhere — match Tilda palette.
- All idle animations slow (2–4s cycles), low amplitude.
- Honor reduced-motion: play a static frame instead of animating.

### Non-scope
- Re-drawing mascots from scratch. Trace/adapt the existing PNGs to keep Pat's approved character.
- Animated mascots on every screen — only where mascots already appear.

### Acceptance
- Each mascot component renders as inline SVG (no extra asset requests).
- Idle motion is subtle and loops without jitter.
- Reduced-motion: static frame shown, no animation.
- File size: each mascot <3KB gzipped.
- Tests + build pass.

---

## Slice 3 — Deal-won celebration (confetti burst)

Replace the static `mascot-won-confetti.png` with a real SVG confetti burst. This is the **one place animation should be bold** — it celebrates a win, motivates the rep.

### Scope
- On deal move to `closed_won`: trigger a one-shot SVG confetti burst (`m.div` particles with random angles + fall).
- Duration: ~1.2s, then auto-cleanup.
- Triggered exactly once per win (the Success-lane move), not on every re-render.

### Non-scope
- Burst on meeting log, log-sale, or any other action. Only closed-won.

### Approach
- Build a `<WinConfetti />` component rendered inside `AnimatePresence` in the deal action flow.
- Generate ~20 SVG confetti pieces (coral + monochrome), physics-randomized rotation + fall.
- Remove from DOM after animation completes.

### Acceptance
- Confetti fires exactly once per closed-won move, ~1.2s, no leftover DOM.
- Does not block the success toast or undo snapshot (parallel, non-blocking).
- Reduced-motion: skip confetti, still show the trophy + toast.
- No perf hit on low-end devices (use `transform`/`opacity` only, no layout thrash).

---

## Implementation order

1. **Slice 1** (save feedback) — immediate, highest impact, smallest surface.
2. **Slice 2** (mascots) — can run in parallel with Slice 1 if delegation available, since it's a separate file tree.
3. **Slice 3** (win celebration) — depends on Slice 1's pattern, goes last.

## Non-scope (explicitly deferred)
- Do-now board card animations (future).
- Revenue countup animations (future).
- Page-load / route-transition animations (future).
- Full icon-set line-drawing (future).
- Replacing the existing CSS hover/tap transitions (keep them; framer-motion adds on top).

## Deployment
No code change to live data or schema. Animation-only, additive. Tests + build must pass before Pat approves deploy.
