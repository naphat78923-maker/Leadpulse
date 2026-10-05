-- Security advisor: anon/authenticated can execute SECURITY DEFINER
-- public.rls_auto_enable() via /rest/v1/rpc
--
-- rls_auto_enable() is the event-trigger function behind the `ensure_rls` event
-- trigger (enables RLS on every new table in public). It returns event_trigger, so
-- Postgres refuses to run it outside an event trigger and an RPC call cannot do
-- anything with it; the grant is still unnecessary. Postgres does not check EXECUTE
-- when an event trigger fires, so revoking it leaves the trigger working.
-- The app never calls it (grep src/).

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
