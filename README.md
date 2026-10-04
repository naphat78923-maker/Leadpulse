# LeadPulse — VG Saveur CRM

A solo-operator B2B CRM for butter & condensed-milk sales. Built to solve one problem: **never drop a follow-up again.**

**Live app:** https://leadpulse-one-ashen.vercel.app (installable as a home-screen PWA on iOS/Android)

## Current Status

**In daily production use** (solo mode, no auth). The app runs on a live Supabase backend with the full sales book — companies, contacts, deals, and every logged touch.

- **Deployed:** Vercel, auto-deploys from `main`
- **Data:** Supabase Postgres — 25 migrations in `supabase/migrations/`, soft-delete + undo on all entities
- **Tests:** 92 Vitest files (about 900 tests) covering workflow, scheduling, scoring and component logic. They run locally with `npm test`; no CI runs them yet
- **Installable:** PWA manifest + iOS meta ship with every build — "Add to Home Screen" opens it standalone

## How It Works

The app is three pages, built around one weekly loop: see who needs you, act, log it.

1. **This week** (`/`) — the daily page.
   - Four stat cards: Overdue, Due this week, Check-ins, Touches in the last 7 days.
   - **Waiting on you**: deals where the buyer replied and nothing has been sent since. A reply means a logged inbound interaction, never one of your own messages.
   - Follow-ups in three tabs: **Overdue** (grouped by age), **This week** (grouped by day), **No date**.
   - Side column: the monthly goal, customers to check in with, and recent changes with **Undo**.
2. **Pipeline** (`/deals`) — the deals.
   - **Prospects**: accounts with no deal yet, with a saved review decision and "Start a deal".
   - **To contact**: Outreach deals with no logged call, email, DM or meeting. Logging the first touch moves a deal onto the board.
   - **Journey**: the board of deals in conversation, with filters, sorts and a "Needs attention" menu (waiting on you, needs review, stalled, missing data).
   - **Parked / Won / Lost / Table**: exits and a searchable table of every deal.
3. **Accounts** (`/companies`) — companies with their people, contact channels (company routes such as a general LINE or info@ address), activity and customer health.

From any row or card you can log a touch (call / email / DM / meeting / note), snooze, or move the deal's lane. Every change is logged with **undo**.

`/lab` is a hidden page for Laya experiments (fit judging and the terminal). Old URLs (`/activity`, `/retention`, `/signals`, `/prospects`, `/contacts`, `/meetings`, `/add`) redirect to the page that replaced them.

### Workflow lanes

Each deal sits in a lane: `outreach → reply → sample → testing → success` (plus `reschedule` / `parked`). Lane transitions are gated — e.g. you can't mark a sample as sent without a delivery address.

### Lead scoring

Weighted 0–100 score (`src/utils/lead-scoring.ts`): stage (30) + priority (20) + deal value (20) + follow-up urgency (20) + last outcome sentiment (10), mapped to tiers **S (Hot) → D (Cold)**. Pure arithmetic over CRM fields — no model involved, so it renders identically on any device. The model-facing Laya rules live separately in `src/utils/laya-buyer-response.ts` (buyer-response question) and `src/utils/laya-evidence.ts` (reviewer panel).

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
npm run test    # vitest run (92 files)
npm run lint    # eslint
npm run laya:serve  # local Laya worker for lead recommendations
```

### Local Laya lead recommendations

Laya runs on this Mac, not on Vercel. The default is the **Typed Decisions 421M**
Core ML bundle (1,024 tokens, CPU/GPU), the checkpoint fine-tuned on typed business
decisions. It replaced the multilingual 322M bundle on 2026-10-01. Its tokenizer is
English: Thai text still runs but expect weaker answers. Download the pinned
revision once, then start the local worker before opening a deal:

```bash
cd ~/Projects/LeadPulse
~/laya-coreml/.venv/bin/hf download aac6fef/laya-typed-decisions-coreml \
  --revision 28d24fa8d67a3264556b23391ec6c3fd98573056 \
  --local-dir ~/laya-coreml/models/typed-decisions
npm run laya:serve
```

The model stays on this Mac and loads offline after download. To go back to the
multilingual bundle, download `aac6fef/laya-multilingual-coreml` at revision
`8139e9089273319512c730218903784074133187` and point `LAYA_COREML_MODEL_PATH` at it. The worker identifies the loaded bundle in
each scoring trace and reports its selected compute units in `/health`.

Then use **Score with Laya** in a deal. The live LeadPulse page calls only
`http://127.0.0.1:8765` on the Mac that opened it; the worker is bound to loopback
and accepts the production app plus local development origins. Its input recipe is
industry, all tags, product, stage, value, follow-up status, and the complete latest
outcome. Selected text is not word-clipped. Dedicated identity, contact, address,
URL and company-note fields are excluded; free-text outcomes and tags can still
contain personal information. This is field minimization, **not anonymization**.
The result is recommendation-only; it never changes CRM data.

**Input safety (slice 1):** the local worker counts the complete encoded input with
the installed model tokenizer, including instructions, options and special tokens.
Each question must fit the model's sequence limit (1,024 for the default bundle;
96 for the older ANE bundle). If the full evidence does not fit, the worker returns HTTP 422 with `status: not_scored`,
`code: input_too_long`, `input_tokens` and `token_limit`. The existing card displays
the refusal message, not a recommendation. No inference runs, nothing is shortened,
and no CRM field changes. Review the evidence manually; do not remove a refusal or
no-contact request just to make a prompt fit. Records exceeding the new limit
will intentionally remain unscored; the HTTP request body is also capped at
16,384 bytes. The larger input budget does not establish better recommendations.

The guard also rejects inputs that Laya's native prompt preparation would alter
(`input_would_change`). Only leading/trailing field whitespace and empty tags are
normalized by the recipe. This guards input integrity, not model judgment accuracy
or outreach authorization. Other pre-deployment review slices remain unresolved.

**Explicit no-contact gate:** before token budgeting or model inference, the worker
checks the complete selected state for a bounded set of explicit English and Thai
opt-out phrases (for example, "do not contact", "requested no contact", or
"ขอไม่ให้ติดต่อ"). A match returns HTTP 422 with `code: contact_opt_out` and a
generic manual-review message. It does not return a Choice recommendation or
store anything in the CRM. This is deliberately conservative but **not** a
complete consent or language classifier; missed, ambiguous, or contradictory
notes still need human review. A negated phrase such as "did not request no
contact" may also be refused for manual review rather than interpreted as
permission. No Laya output authorizes outreach.

**Question source:** every frozen question and every accepted question set lives once,
in `src/utils/laya-questions.json`. The TypeScript builder imports it and the worker
loads it; `/score` accepts only those sets (`buyer`, `terminal`, `fit`) and answers with
`{answers, usage, trace}`. Every client checks a response with the one shared parser in
`src/utils/laya-answers.ts`, which also requires the trace to echo the exact request.

**Judgment scope:** the score card asks one question: buyer-response `Choice`, which gives
attention advice, not purchase odds, qualification or contact authorization (8/8
requested_next_step recall on verbatim replies, `scripts/eval_results/2026-09-23-buyer-response-eval-report.md`).
The /lab terminal adds two buyer-detail Nouls in the same pass; they are review-only and
not yet accuracy-evaluated. Deal size is **not** a model question: the CRM value is already a
number, and `lead-scoring.ts` buckets it in code. Prospect fit asks one yes/no `Noul` per
published archetype over a plain-sentence identity; code picks the highest at or above 0.5,
otherwise `no_fit` (`scripts/eval_results/2026-09-29-prospect-fit-eval.md`). The card labels
percentages as option probabilities and does not manufacture a model reasoning narrative.
Existing deterministic CRM rules are unchanged.

**Result identity (slice 2):** a score belongs to one deal, linked company, Bangkok
day and exact serialized input (including the question/options). Changing any of
those resets the card and aborts its outstanding request. Late successes, failures
and JSON bodies are ignored, even if the transport does not honor cancellation.
Identical input refreshes keep the result; changing away and back does not resurrect
an old request. Results are in-memory only, not shared or persisted to the CRM.

**Re-score with Laya** remains available after success. A re-score clears the prior
recommendation while loading; a failure leaves no old recommendation masquerading
as current. Bangkok day changes are checked before sending/accepting a result,
on window focus/visibility changes, and once per minute while the card is mounted.
A click that detects a new day resets the card without inference; click again to
score the updated input. Cancellation stops browser handling, not necessarily
inference already executing in the worker.

**Transport (slice 3):** the browser calls the worker either on the same Mac
over IPv4 loopback or, when explicitly selected, via private Tailscale HTTPS.
The unused Next.js `/api/laya/score`
proxy is removed; Vercel cannot reach your Mac via its own `127.0.0.1`. The default
**This Mac** connection remains loopback-only. For Pat's phone, the explicitly
selected **Private phone (Tailscale)** connection calls the Mac over tailnet-only
HTTPS at `https://phats-macbook-air.tailc9beb9.ts.net`. The worker still binds
only to `127.0.0.1`; Tailscale Serve proxies port 443 to it. Never use Funnel or
publish port 8765. Both devices must be connected to Pat's tailnet, and the Mac
worker and Serve must stay running. The tailnet host is embedded in the public
browser bundle and is not a secret; membership in the tailnet is the access
boundary. A shared Mac node or overly broad tailnet access can broaden who can
reach the worker. No automatic scoring or cloud-model fallback is provided.
The rest of the CRM does not require the worker.

On this Mac, enable Tailscale Serve/HTTPS certificates for the tailnet, then:

```sh
LAYA_SCORE_TAILNET_HOST=phats-macbook-air.tailc9beb9.ts.net npm run laya:serve
tailscale serve --bg --https 443 http://127.0.0.1:8765
tailscale serve status --json
```

The first command uses a separate worker process; the `LAYA_SCORE_TAILNET_HOST`
setting is intentionally opt-in and must be present whenever the worker restarts.
The Serve command is persistent on this Mac until explicitly disabled with
`tailscale serve --https=443 off`. A browser on the phone must choose the private
connection in the Laya card; it never silently sends CRM input to that host.

The card sends scoring input only when **Score with Laya** is clicked. The
transport supports a `/health` GET with no CRM payload, but this card has no
separate health-check control. A health response is a point-in-time connectivity
check, not a guarantee that scoring will succeed. Health checks time out after
5 seconds; scoring after
30 seconds, including response-body parsing. Canceled or timed-out responses cannot
later populate the card. Browser cancellation does not stop already-running model
inference. There are no automatic retries.

`NEXT_PUBLIC_LAYA_SCORE_SERVICE_URL` is a build-time browser setting for the
default Mac connection. Its default is `http://127.0.0.1:8765`; only a plain HTTP
`127.0.0.1` origin (with an optional port) is permitted for that mode. The private
mode accepts only the pinned HTTPS Tailscale host, not an arbitrary remote or LAN
URL. Credentials, paths, query strings and fragments are rejected before sending
any data. If changing the local port, set `LAYA_SCORE_PORT` on the worker and
rebuild the browser bundle with the matching origin. Do not set
`LAYA_SCORE_SERVICE_URL` on Vercel; that old server-side setting is unused.

For connection problems: start `npm run laya:serve` in this project on the browsing
Mac and wait for its ready message. Use a supported browser and, if prompted, allow
local-network access for your trusted LeadPulse origin. Browser permission, CORS,
secure-context and local-network policies can block an otherwise healthy worker;
a failed fetch cannot reliably distinguish these from a stopped worker. Do not
turn off browser security or open the worker directly to the network as a workaround.
A terminal `curl /health` success alone does **not** verify hosted-browser access.
A slice-3 browser probe from the actual HTTPS production origin in an isolated
Chrome 153 context was blocked with its default permissions. After granting
`local-network-access` **in that disposable test context only**, the same browser
returned HTTP 200 from `/health` and `/score` using synthetic builder input (93
input tokens, zero output tokens). This checks the transport from the hosted origin,
not a deployed slice-3 UI or the permissions of your existing Brave/Safari profile.
The worker's Host/Origin checks and fixed schema are described in slice 5 below.

**Transparency (slice 4):** after a successful score, expand **Scoring trace**
to see the exact state and full Choice question/options that the local worker
passed to Laya, the excluded fields, model repository/source revision and
package SHA-256 from the installed model manifest, engine, and the worker's
UTC completion timestamp. This is provenance, not a causal explanation or proof
of model accuracy; manifest metadata is not a fresh checksum verification of
model bytes. The client compares the worker-echoed input with the exact request
and refuses to show a mismatched or untraceable result (including from an older
running worker). Refusals contain no scored trace. Results and traces remain
in-memory in the deal card; no trace is saved to Supabase or logged by the
worker. Free text may contain personal details despite excluding dedicated
identity fields. Restart a worker started before this slice to get the trace.

**Worker boundaries (slice 5):** scoring accepts only requests to the exact
`Host: 127.0.0.1:<configured port>` or an explicitly configured tailnet Host,
with one allowlisted `Origin` (the production
LeadPulse origin or configured local development origins). It rejects missing,
duplicate, or untrusted origins and DNS-rebinding Host names before reading the
body. `/health` also requires an approved Host, but permits no Origin for a local
CLI health check. CORS/preflight is granted only to allowlisted origins on `/score`;
private-network preflight is acknowledged when requested. Scoring requires
`Content-Type: application/json`, one Content-Length, a bounded body, no
ambiguous duplicate JSON keys, and exactly the single published attention Choice
question with its fixed instructions and four criteria. An edited or extra
question is refused, not inferred.

This is **browser-origin isolation, not authentication of local processes**:
software running on this Mac can spoof HTTP headers and submit its own state. No
password or bearer token is embedded in the public browser bundle. Do not expose
the worker directly on a LAN or via Funnel; private Serve is reachable by tailnet
members with access to this Mac. At most four
HTTP connections are handled concurrently (10-second socket timeout) and one
model preflight/inference runs at once; overload receives 503 and can be retried
manually. When the socket cap is full, the browser may report a generic
connection/CORS failure instead of exposing the 503 body. Unexpected model
exceptions produce generic errors without echoing input or exception text.
This does not establish authorization to contact a lead, model accuracy, or
safety against malicious software already running locally.

Run input-boundary tests with the Python environment containing `laya-coreml` and
the downloaded model tokenizer/config files (no neural inference in this suite):

```bash
/Users/pat/laya-coreml/.venv/bin/python -B -m unittest discover -s scripts -p 'test_laya_score_server.py' -v
npm test -- src/utils/laya-buyer-response.test.ts src/utils/laya-buyer-response.contract.test.ts src/utils/laya-answers.test.ts src/components/LayaScoreCard.test.tsx
```

The default paths match Pat's install. Override either only if Laya lives elsewhere:

```bash
LAYA_COREML_PYTHON=/Users/pat/laya-coreml/.venv/bin/python \
LAYA_COREML_MODEL_PATH=/path/to/another/laya-coreml-bundle \
npm run laya:serve
```

## Project Structure

```
src/
├── app/                  # Routes: / (This week), /deals (Pipeline),
│   │                     #   /companies (Accounts), /lab, api/
│   ├── layout.tsx        # Root layout: sidebar, theme, PWA meta
│   └── manifest.ts       # PWA manifest
├── components/           # CrmProvider (data layer + undo), ThisWeekQueue,
│   │                     #   DealDetail, CompanyDetail, LogInteractionModal,
│   │                     #   ProspectsTab, Laya* cards, motion/, blob/ …
│   ├── pipeline/         # Pipeline pieces: toolbar, table, review queue,
│   │                     #   drag-and-drop lanes, bulk bar
│   └── *.test.tsx        # Component tests colocated
├── hooks/                # useQuerySelection (?deal= / ?company= links),
│                         #   useReorderSignals, useLayaReviewList
├── lib/                  # crm.ts (Supabase data access), supabase.ts, historical
├── utils/                # Pure domain logic, all unit-tested:
│                         #   deal-workflow, followup-policy, this-week-queue,
│                         #   this-week-stats, waiting-on-you, to-contact,
│                         #   lead-scoring, retention-touch, laya-* …
└── types/                # crm.ts (the data model)
supabase/migrations/      # Schema migrations
scripts/                  # Sheet import, Laya worker and evals, report generators
.hermes/plans/            # Design & delivery planning docs (de-identified)
docs/                     # Visual system spec, historical-sales proposal
```

## Roadmap

- [x] Core CRM on Supabase with real data, log form and undoable activity log
- [x] Consolidated from nine pages to three: This week, Pipeline, Accounts
- [x] Retention check-ins and reorder signals folded into This week
- [x] Laya grading foundation (local model, pasted buyer replies)
- [ ] Run tests automatically on every PR (CI)
- [ ] One-tap contact actions and message templates
- [ ] Telegram + Web Push notifications (`node-telegram-bot-api` installed, not wired)
- [ ] Security hardening: add a login, env-based Supabase keys, tighten RLS "allow all" policies

## Design Decisions

- **No auth — solo mode.** Single shared view, Supabase RLS set to allow-all. Fine for one operator; must change before any multi-user use.
- **Action-first, not record-first.** The homepage answers "what do I do next?" — lists and detail pages are secondary.
- **Derived over stored.** Nudge stage, due status, and scores are computed from dates/touches, so the data can't drift out of sync with reality.
- **Undo everything.** Deletes are soft (archived), and creates/deletes/edits log an undo payload.
- **Clay design system** — warm butter-inspired palette (ochre, peach, lavender) with strict light/dark contrast tokens, distinct from Cal Omega's sage/green.
