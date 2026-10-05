-- Security advisor: security_definer_view (real_revenue, unified_sales, reorder_signals)
--
-- All three views are owned by postgres and were created without security_invoker,
-- so they run with the owner's rights and skip RLS on sales / customers /
-- customer_link. Those tables are deliberately closed to anon (sales and customers
-- allow `authenticated` only; customer_link has no policy at all).
--
-- real_revenue — a simple one-table view over sales, so Postgres makes it
-- auto-updatable: before this migration the anon key could SELECT, UPDATE and DELETE
-- invoice rows in sales through /rest/v1/real_revenue. Nothing reads it (not the app,
-- not another view), so it switches to security_invoker: RLS on sales now applies to
-- the caller and anon sees no rows.
--
-- unified_sales — exposed every invoice date and amount to anon. It CANNOT switch to
-- security_invoker: reorder_signals reads it, and an invoker view checks its base
-- tables as the querying user even when reached through a definer view, so the
-- browser would get zero reorder signals (verified on a local replica). Instead anon
-- and authenticated lose direct access; reorder_signals still reads it as its owner.
-- The advisor keeps listing unified_sales because the lint looks at the view option,
-- not at grants.
--
-- reorder_signals — read by the browser (src/lib/historical.ts,
-- fetchReorderSignalRows) with the anon key. It only works because it bypasses RLS on
-- sales/customers/customer_link, so it stays a definer view on purpose: it is the
-- narrow, aggregated, read-only window onto the sales history. Finding accepted.

alter view public.real_revenue set (security_invoker = true);

-- The app only ever SELECTs reorder_signals. No view should be a write path into
-- the tables underneath, and unified_sales is internal to reorder_signals.
revoke insert, update, delete, truncate, references, trigger
  on public.real_revenue, public.reorder_signals
  from anon, authenticated;
revoke all on public.unified_sales from anon, authenticated;

comment on view public.unified_sales is
  'Internal input to reorder_signals. Deliberately SECURITY DEFINER with no anon/'
  'authenticated grants; see 20260929120000_views_security_invoker.sql.';
comment on view public.reorder_signals is
  'Deliberately SECURITY DEFINER (no security_invoker): the anon browser client reads '
  'this aggregate while sales/customers/customer_link stay closed to anon. '
  'See 20260929120000_views_security_invoker.sql.';
