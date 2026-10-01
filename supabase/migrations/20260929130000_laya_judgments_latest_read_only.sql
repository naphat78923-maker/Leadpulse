-- Supabase default privileges gave anon/authenticated write grants on the
-- laya_judgments_latest view. Writes already failed (DISTINCT ON views are not
-- updatable, and the base table denies them), but the grants should say what is
-- true: the view is read-only for the app, like the table behind it.

revoke insert, update, delete, truncate on public.laya_judgments_latest from anon, authenticated;
