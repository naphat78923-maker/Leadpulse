-- Security advisor: extension_in_public (pg_trgm)
--
-- pg_trgm was created in public by 20260822091500_historical_signals.sql for the
-- one-time customer_link fuzzy seed. No index, view, function or column depends on
-- it (checked pg_depend on the live project 2026-09-29), and the app does not call
-- similarity() (grep src/). Recreating it in the extensions schema removes its
-- functions from the anon-exposed public API; the role search_path
-- ("$user", public, extensions) still resolves similarity() for ad hoc SQL.
--
-- On Supabase the extension is owned by supabase_admin, so
-- `alter extension pg_trgm set schema extensions` fails for postgres ("must be owner
-- of function set_limit"). Drop and recreate is Supabase's documented remediation.
-- Without CASCADE the drop fails loudly if anything has started depending on it.
-- Optional: this finding is cosmetic; skip this file if in doubt.

drop extension if exists pg_trgm;
create extension if not exists pg_trgm with schema extensions;
