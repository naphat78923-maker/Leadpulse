-- Stakeholder mini-map (company-level). Deals inherit via company_id.
-- Champion / decision maker / optional blocker (contact OR free-text label).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS champion_contact_id uuid,
  ADD COLUMN IF NOT EXISTS decision_maker_contact_id uuid,
  ADD COLUMN IF NOT EXISTS blocker_contact_id uuid,
  ADD COLUMN IF NOT EXISTS blocker_label text,
  ADD COLUMN IF NOT EXISTS map_status text NOT NULL DEFAULT 'unknown';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_map_status_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_map_status_check
      CHECK (map_status IN ('unknown', 'partial', 'complete'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_champion_contact_id_fkey'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_champion_contact_id_fkey
      FOREIGN KEY (champion_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_decision_maker_contact_id_fkey'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_decision_maker_contact_id_fkey
      FOREIGN KEY (decision_maker_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_blocker_contact_id_fkey'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_blocker_contact_id_fkey
      FOREIGN KEY (blocker_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.companies.champion_contact_id IS 'Stakeholder map: internal champion contact';
COMMENT ON COLUMN public.companies.decision_maker_contact_id IS 'Stakeholder map: who must say yes';
COMMENT ON COLUMN public.companies.blocker_contact_id IS 'Stakeholder map: friction contact (optional)';
COMMENT ON COLUMN public.companies.blocker_label IS 'Stakeholder map: free-text blocker e.g. Procurement (optional)';
COMMENT ON COLUMN public.companies.map_status IS 'unknown | partial | complete — derived by app on write';

-- Keep map_status consistent for existing rows (all unknown until tagged).
UPDATE public.companies
SET map_status = 'unknown'
WHERE map_status IS NULL OR map_status NOT IN ('unknown', 'partial', 'complete');
