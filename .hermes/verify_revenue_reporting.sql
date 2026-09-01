SELECT json_build_object(
  'columns', (
    SELECT json_agg(json_build_object('name', column_name, 'type', data_type, 'default', column_default) ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deals'
      AND column_name IN ('currency', 'close_date', 'stage_probability')
  ),
  'totals', (
    SELECT json_build_object(
      'deals', count(*),
      'currency_thb', count(*) FILTER (WHERE currency = 'THB'),
      'open_deals', count(*) FILTER (WHERE stage NOT IN ('closed_won', 'closed_lost')),
      'open_close_date_2026_12_31', count(*) FILTER (
        WHERE stage NOT IN ('closed_won', 'closed_lost') AND close_date = DATE '2026-12-31'
      ),
      'closed_with_planning_close_date', count(*) FILTER (
        WHERE stage IN ('closed_won', 'closed_lost') AND close_date = DATE '2026-12-31'
      ),
      'probability_populated', count(*) FILTER (WHERE stage_probability IS NOT NULL)
    )
    FROM public.deals
  ),
  'by_stage', (
    SELECT json_agg(json_build_object(
      'stage', stage,
      'deals', deal_count,
      'probability', stage_probability
    ) ORDER BY stage)
    FROM (
      SELECT stage, stage_probability, count(*) AS deal_count
      FROM public.deals
      GROUP BY stage, stage_probability
    ) s
  )
) AS verification;
