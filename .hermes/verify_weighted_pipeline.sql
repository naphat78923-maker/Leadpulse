SELECT json_build_object(
  'open_pipeline_thb', COALESCE(SUM(value), 0),
  'weighted_pipeline_thb', COALESCE(SUM(value * stage_probability / 100.0), 0),
  'valued_open_deals', COUNT(*)
) AS result
FROM public.deals
WHERE stage NOT IN ('closed_won', 'closed_lost')
  AND value IS NOT NULL;
