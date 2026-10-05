-- Security advisor: function_search_path_mutable
-- (public.normalize_name, public.clear_followup_on_close)
--
-- Neither function is SECURITY DEFINER and anon/authenticated cannot create objects
-- in public, so there is no practical hijack path today. Pinning search_path to ''
-- removes the finding at no cost: both bodies only use pg_catalog built-ins
-- (lower, regexp_replace) or the trigger row, and pg_catalog is always searched.
-- normalize_name is not used by any index, view or app code; clear_followup_on_close
-- is the BEFORE INSERT OR UPDATE trigger on public.deals.

alter function public.normalize_name(text) set search_path = '';
alter function public.clear_followup_on_close() set search_path = '';
