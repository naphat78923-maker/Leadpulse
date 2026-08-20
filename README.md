# LeadPulse — VG Saveur Leads Tracker

A focused B2B leads tracker for solo butter sales. Built to solve one problem: **never drop a follow-up again.**

## Quick Start

```bash
cd ~/Projects/LeadPulse
npm run dev
```

Open http://localhost:3000

## Features

- **Today View** — Shows overdue, due today, and upcoming follow-ups. Empty-date leads flagged as "Needs Attention."
- **Pipeline** — Kanban board with drag-and-drop stage advancement (Research → Contacted → Needs to Send → Testing → Success)
- **Add Lead** — Full contact capture form matching your existing sheet fields
- **Snooze** — Quick 3d/7d snooze on any lead
- **Stats Bar** — Total leads, need action, due today, this week

## Data

Current build uses sample data imported from your actual sheet structure (10 representative leads covering all stages).

### Full Import Script

A `scripts/import-from-sheet.js` is provided to pull all 75 leads via the Google Sheets API (uses the existing OAuth from `google-sheets-access` skill).

```bash
node scripts/import-from-sheet.js 1ZfOmrhwVizV3Uvn1jBkBQvLv-pgQfAUSzs-BOfAhXFE
```

## Tech Stack

- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS
- **DnD:** @dnd-kit (modern, accessible)
- **Backend (Phase 2):** Supabase
- **Notifications (Phase 2):** Telegram Bot + Web Push

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with sidebar
│   ├── page.tsx            # Today view (dashboard)
│   ├── pipeline/page.tsx   # Kanban board
│   └── add/page.tsx        # Add lead form
├── components/
│   └── Sidebar.tsx         # Navigation sidebar
├── types/
│   └── lead.ts             # TypeScript types for leads
└── data/
    └── mockData.ts         # Sample data from sheet
```

## Roadmap

- [x] Phase 1: Core UI — Today, Pipeline, Add Lead
- [ ] Phase 2: Supabase backend + real data import
- [ ] Phase 3: Log interaction modal (call/email/meeting/note)
- [ ] Phase 4: Nudge flow automation
- [ ] Phase 5: Telegram + Web Push notifications
- [ ] Phase 6: Analytics dashboard (conversion rates, stage durations, source tracking)

## Design Decisions

- **No auth** — Solo mode, no login required. Single shared view.
- **Empty follow-up dates** → "Needs Attention" section at top (not hidden, not auto-today)
- **Drag-and-drop pipeline** — Intuitive stage advancement matching your sheet's workflow
- **Orange/amber brand** — Warm, butter-inspired palette distinct from Cal Omega's sage/green
