# LeadPulse — VG Saveur CRM

A solo-operator B2B CRM for butter & condensed-milk sales. Built to solve one problem: **never drop a follow-up again.**

**Live app:** https://leadpulse-one-ashen.vercel.app (installable as a home-screen PWA on iOS/Android)

## Current Status

**In daily production use** (solo mode, no auth). The app runs on a live Supabase backend with the full sales book — companies, contacts, deals, and every logged touch.

- **Deployed:** Vercel, auto-deploys from `main`
- **Data:** Supabase Postgres — 20 migrations applied, soft-delete + undo on all entities
- **Tests:** 39 Vitest suites covering workflow, scoring, scheduling, and component logic
- **Installable:** PWA manifest + iOS meta ship with every build — "Add to Home Screen" opens it standalone

## How It Works

The app is organized around a **daily action loop**, not a database browser:

1. **Today** (`/`) — "Do this next" hero surfaces the single most urgent move (overdue follow-up > due today > needs attention), then a priority-ordered queue. A pulse strip shows touch counts for the last 7 days.
2. **Act** — From any card: log a touch (call / email / DM / meeting / sample), snooze, or advance the deal's workflow lane. Every action writes to the activity log with **undo**.
3. **Nudges** (`/nudges`) — Deals that go quiet climb a nudge ladder (warm → remind → firm → parking) derived from days-since-contact and send counts. This is the "never drop a follow-up" engine.
4. **Deals** (`/deals`) — The working board. Rows carry priority borders, lead-score tiers (S/A/B/C/D), and lane gates that block advancement when required details are missing.
5. **Retention** (`/retention`) + **Signals** (`/signals`) — Account health, reorder cadence detection, and buying-signal surfacing for existing customers, fed by order history (`account_events`).

Supporting surfaces: **Contacts, Companies, Prospects** (review queue for new leads), **Meetings** (full interaction log), **Activity** (undoable action feed), **Analytics** (conversion + revenue), **Pipeline** (kanban).

### Workflow lanes

Each deal sits in a lane: `outreach → reply → sample → testing → success` (plus `reschedule` / `parked`). Lane transitions are gated — e.g. you can't mark a sample as sent without a delivery address.

### Lead scoring

Weighted 0–100 score (`src/utils/lead-scoring.ts`): stage (30) + priority (20) + deal value (20) + follow-up urgency (20) + last outcome sentiment (10), mapped to tiers **S (Hot) → D (Cold)**.

## Tech Stack

- **Frontend:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4
- **Motion/UI:** framer-motion, custom clay design system, dark mode, lucide icons
- **DnD:** @dnd-kit
- **Backend:** Supabase (Postgres + RLS), direct client access via `@supabase/supabase-js`
- **Testing:** Vitest + Testing Library (happy-dom)
- **Deploy:** Vercel · **Timezone-aware:** all "today" logic pins to Asia/Bangkok

## Quick Start

```bash
cd ~/Projects/Leadpulse
npm install
npm run dev        # http://localhost:3000
```

> **Note:** the Supabase project URL + anon key are currently hardcoded in `src/lib/supabase.ts` (solo mode). Moving them to `.env.local` is on the debt list.

### Commands

```bash
npm run dev     # dev server
npm run build   # production build
npm run test    # vitest run (39 suites)
npm run lint    # eslint
```

## Project Structure

```
src/
├── app/                  # Routes: today, deals, nudges, signals, retention,
│   │                     #   prospects, contacts, companies, meetings, activity,
│   │                     #   analytics, pipeline, add, api/
│   ├── layout.tsx        # Root layout: sidebar, theme, PWA meta
│   └── manifest.ts       # PWA manifest
├── components/           # CrmProvider (data layer + undo), DealDetail,
│   │                     #   LogInteractionModal, NudgeLadderRail, LaneGateModal,
│   │                     #   StakeholderMiniMap, motion/ …
│   └── *.test.tsx        # Component tests colocated
├── lib/                  # crm.ts (Supabase data access), supabase.ts, historical
├── utils/                # Pure domain logic, all unit-tested:
│                         #   deal-workflow, lead-scoring, deal-schedule,
│                         #   reorderPolicy, prospectFit, stakeholder-map, format…
├── types/                # crm.ts (live model) · lead.ts (legacy, used by /add)
└── data/                 # crmData fallback + original sheet import
supabase/migrations/      # 20 sequential schema migrations
scripts/                  # Sheet import, Supabase setup/test, report generators
.hermes/plans/            # Design & delivery planning docs (de-identified)
docs/                     # Visual system spec, historical-sales proposal
```

## Roadmap

- [x] Phase 1: Core UI — Today, Pipeline, Add Lead
- [x] Phase 2: Supabase backend + real data import
- [x] Phase 3: Log interaction modal (call/email/DM/meeting/sample/note) + undoable activity log
- [x] Phase 4: Nudge flow automation (derived nudge ladder)
- [x] Phase 6 (partial): Analytics + retention/reorder signals
- [ ] Phase 5: Telegram + Web Push notifications (`node-telegram-bot-api` installed, not wired)
- [ ] Security hardening: env-based Supabase keys, tighten RLS "allow all" policies
- [ ] Prospect review queue GA; stakeholder mini-map rollout

## Design Decisions

- **No auth — solo mode.** Single shared view, Supabase RLS set to allow-all. Fine for one operator; must change before any multi-user use.
- **Action-first, not record-first.** The homepage answers "what do I do next?" — lists and detail pages are secondary.
- **Derived over stored.** Nudge stage, due status, and scores are computed from dates/touches, so the data can't drift out of sync with reality.
- **Undo everything.** Deletes are soft (archived), and creates/deletes/edits log an undo payload.
- **Clay design system** — warm butter-inspired palette (ochre, peach, lavender) with strict light/dark contrast tokens, distinct from Cal Omega's sage/green.
