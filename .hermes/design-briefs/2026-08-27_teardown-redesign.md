# LeadPulse Redesign Brief — Visual Teardown (2026-08-27)

> **Status:** Re-review found this token-first direction too generic for LeadPulse. It is not approved for implementation. Preserve the warm night-desk identity and validate the revised action-board slice with Pat before changing code.

Source: live CSS token extraction from Folk, Attio, Pipedrive homepages + transcript research.
Vision tool was unavailable (external API key 401); brief is token-precise, not pixel-copied.

## Competitor signals
- **Folk**: Founders Grotesk, body 14.4/23, text rgba(3,2,0,0.89), H1 64px/500, flat borderless buttons, 0px radius. Calm + whitespace + color-coded tags.
- **Attio**: Inter, base 16/22, tracking -0.16px, H1 64px/600/-1.28px, buttons radius 10px, near-black solid primary + bordered ghost, native dark mode. Modern + technical.
- **Pipedrive**: Inter, H1 52px/700 in brand green #017735, owns green, strong Kanban, full iOS/Android parity.

## LeadPulse design tokens (dark-first)
- Background: #0E0F12 (warm near-black), surface #15171C, card #1B1E24
- Text: #F5F3EF primary, #A8A29A / #8B867E secondary (night-desk mandatory contrast)
- Accent (ownable, single): green #34D27B primary, #1F9D57 hover. Reused as save-confirmation ring.
- Type: Inter. Display 600-700, tracking -1px. Base 15-16px / 1.5.
- Radius: 10-12px. Spacing scale 4/8/12/16/24/32/48.
- Buttons: primary solid green radius 10px weight 600; secondary 1px ghost border. Preserve explicit SAVE (spinner + toast + green ring).
- Empty states: large calm illustration + one CTA. Mascot subtle, never jarring.
- Micro-interactions: green-ring save, tap scale, smooth stage transitions (borrow Cal Omega lightness sparingly).
- Home hero = the Do now board (overdue/today/review), not a settings dashboard.
- Mobile parity: Pipedrive bar. Deal board works as well on phone as desktop. Bottom nav, thumb-zone CTAs.

## Steal vs ignore
- Steal: Attio tight tracking + soft radius + native dark; Folk calm empty states + onboarding speed; Pipedrive green ownership + mobile parity.
- Ignore: Folk 0px sharp buttons (too cold for an app); Pipedrive marketing density.

## Next build pass (proposed)
1. Add design-token module (colors, type scale, radius, spacing).
2. Redesign Do now board in dark mode against tokens.
3. Save affordance: green-ring + toast micro-interaction.
4. Empty states for deals/contacts.
5. Mobile parity check on deal board.
