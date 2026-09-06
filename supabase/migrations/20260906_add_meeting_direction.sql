-- Send-count nudge gauge: track interaction direction on meetings.
-- Only outbound call/email/DM count as sends (1st → 4th, then park).
-- Mirrors the dormant interactions.direction design.

alter table public.meetings
  add column if not exists direction text not null default 'unknown'
  check (direction = any (array['inbound'::text, 'outbound'::text, 'internal'::text, 'unknown'::text]));

-- Backfill history: call/email/DM logs were outreach sends; everything else was internal.
update public.meetings
set direction = 'outbound'
where direction = 'unknown'
  and type in ('call', 'email', 'dm');

update public.meetings
set direction = 'internal'
where direction = 'unknown'
  and type in ('meeting', 'note', 'sample_sent', 'reward', 'nudge');
