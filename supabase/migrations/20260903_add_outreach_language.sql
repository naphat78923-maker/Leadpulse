-- Outreach language awareness for the Ebimaru drafting brief.
-- Additive only: existing rows land on 'autodetect' safely.

alter table public.contacts
  add column if not exists outreach_language text not null default 'autodetect';

alter table public.contacts
  add constraint contacts_outreach_language_check
  check (outreach_language in ('thai', 'english', 'autodetect'));

alter table public.contacts
  add column if not exists outreach_language_basis text not null default 'autodetect';

alter table public.contacts
  add constraint contacts_outreach_language_basis_check
  check (outreach_language_basis in ('last_inbound', 'pat_override', 'autodetect'));
