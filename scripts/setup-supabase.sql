-- LeadPulse CRM — Supabase Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/mkyhikarlxuwvprjabbi/sql/new

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════
-- COMPANIES
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect', 'active_customer', 'inactive', 'lost')),
  lead_source TEXT,
  account_owner TEXT,
  last_contact_date DATE,
  tags TEXT[] DEFAULT '{}',
  industry TEXT,
  size TEXT CHECK (size IN ('A', 'B', 'C')),
  address TEXT,
  website TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- CONTACTS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  phone_second TEXT,
  line TEXT,
  job_title TEXT,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replied', 'not_interested', 'no_response', 'parked')),
  identity_quality TEXT NOT NULL DEFAULT 'unknown' CHECK (identity_quality IN ('named', 'role_only', 'company_route', 'unknown')),
  last_contacted_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- DEALS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS deals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'research' CHECK (stage IN ('research', 'contacted', 'proposal', 'negotiation', 'closed_won', 'closed_lost')),
  product TEXT NOT NULL DEFAULT 'Butter',
  client TEXT NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  contact_ids UUID[] DEFAULT '{}',
  value NUMERIC,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  next_action TEXT,
  draft_primary_ask TEXT,
  followup_date DATE,
  last_outcome TEXT,
  nudge_count INTEGER DEFAULT 0,
  workflow_action TEXT NOT NULL DEFAULT 'outreach' CHECK (workflow_action IN ('outreach', 'reply', 'sample', 'testing', 'reschedule', 'parked', 'success')),
  nudge_stage TEXT CHECK (nudge_stage IN ('warm', 'remind', 'firm', 'parking')),
  sample_status TEXT CHECK (sample_status IN ('sent', 'received')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- MEETINGS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS meetings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'sample_sent', 'nudge', 'note', 'dm', 'reward')),
  date DATE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  contact_ids UUID[] DEFAULT '{}',
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  product TEXT,
  summary TEXT,
  outcome TEXT CHECK (outcome IN ('positive', 'neutral', 'negative', 'no_response')),
  followup_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_deals_company ON deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_followup ON deals(followup_date);
CREATE INDEX IF NOT EXISTS idx_meetings_deal ON meetings(deal_id);
CREATE INDEX IF NOT EXISTS idx_meetings_company ON meetings(company_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);

-- ═══════════════════════════════════════
-- ROW LEVEL SECURITY (Solo mode — allow all)
-- ═══════════════════════════════════════
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- Policies: allow all operations for anon (solo mode)
CREATE POLICY "Allow all for anon" ON companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON deals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON meetings FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════
-- SEED DATA (optional — uncomment to seed)
-- ═══════════════════════════════════════
-- INSERT INTO companies (name, status, lead_source, account_owner, tags) VALUES
--   ('April''s Bakery', 'active_customer', 'Official Homepage', 'Ebimaru-san', ARRAY['bakery', 'chain']),
--   ('Million Foods', 'active_customer', 'Pat Update', 'Pat', ARRAY['manufacturer', 'cookies']);
