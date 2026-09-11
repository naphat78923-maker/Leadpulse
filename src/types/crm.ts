// LeadPulse CRM — Full Database Schema
// Four connected databases: Contacts, Companies, Deal Pipeline, Meetings

// ─── Companies ───
export type CompanyStatus = 'prospect' | 'active_customer' | 'inactive' | 'lost';

export interface Company {
  id: string;
  name: string;
  status: CompanyStatus;
  lead_source: string;
  account_owner: string;
  last_contact_date: string | null;
  tags: string[];
  industry: string | null;
  size: string | null;
  address: string | null;
  website: string | null;
  logo_url?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Retention cadence (Slice 5, Phase 2): last logged human touch + derived next due. */
  last_human_touch?: string | null;
  next_touch_due?: string | null;

  // Stakeholder mini-map (company-level; deals inherit)
  champion_contact_id?: string | null;
  decision_maker_contact_id?: string | null;
  blocker_contact_id?: string | null;
  blocker_label?: string | null;
  map_status?: 'unknown' | 'partial' | 'complete';
}

// ─── Contacts ───
export type ContactStatus = 'active' | 'replied' | 'not_interested' | 'no_response' | 'parked';
export type ContactIdentityQuality = 'named' | 'role_only' | 'company_route' | 'unknown';
export type OutreachLanguage = 'thai' | 'english' | 'autodetect';
export type OutreachLanguageBasis = 'last_inbound' | 'pat_override' | 'autodetect';

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phone_second: string | null;
  line: string | null;
  job_title: string | null;
  company_id: string | null;
  status: ContactStatus;
  identity_quality?: ContactIdentityQuality | null;
  outreach_language?: OutreachLanguage;
  outreach_language_basis?: OutreachLanguageBasis;
  last_contacted_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Deal Pipeline ───
export type DealStage =
  | 'research'
  | 'contacted'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

// Action-board state: what needs to happen next. This is intentionally
// separate from the pipeline stage, which remains the sales-health signal.
export type DealWorkflowAction =
  | 'outreach'
  | 'reply'
  | 'sample'
  | 'testing'
  | 'reschedule'
  | 'parked'
  | 'success';

export type NudgeStage = 'warm' | 'remind' | 'firm' | 'parking';
export type SampleStatus = 'sent' | 'received';
export type Value_type = 'estimated' | 'committed' | 'unknown';

export interface ReshipEntry {
  date: string;
  reason: string;
}

export interface Deal {
  id: string;
  title: string;
  stage: DealStage;
  product: string;
  client: string;          // denormalized for display
  company_id: string | null;
  contact_ids: string[];
  value: number | null;
  priority: 'high' | 'medium' | 'low';
  next_action: string | null;
  draft_primary_ask?: string | null;
  followup_date: string | null;
  last_outcome: string | null;
  nudge_count: number;
  workflow_action?: DealWorkflowAction | null;
  nudge_stage?: NudgeStage | null;
  sample_status?: SampleStatus | null;
  /** Exit metadata — not journey lanes */
  lost_reason?: 'price' | 'taste' | 'timing' | 'vendor_list' | 'no_reply' | 'other' | null;
  park_reason?: string | null;
  won_note?: string | null;
  created_at: string;
  updated_at: string;

  // Revenue reporting fields (2026-08-28)
  currency?: string | null;
  close_date?: string | null;
  stage_probability?: number | null;

  // ─── Sales Controls (2026-09-03) ───

  // Deal health
  blocker?: string | null;
  owner_contact_id?: string | null;
  stale_days?: number | null;

  // Test-to-order
  test_recipient_contact_id?: string | null;
  test_application?: string | null;
  test_conditions?: string | null;
  test_result_texture?: string | null;
  test_result_flavour?: string | null;
  test_feedback_date?: string | null;
  reship_count?: number;
  reship_history?: ReshipEntry[] | null;

  // Forecast integrity
  decision_maker_contact_id?: string | null;
  value_type?: Value_type | null;
  conflicting_signals?: string[] | null;
}

// ─── Meetings ───
export type MeetingType = 'call' | 'email' | 'dm' | 'meeting' | 'sample_sent' | 'note' | 'nudge' | 'reward';

export interface Meeting {
  id: string;
  description: string;
  type: MeetingType;
  date: string;
  company_id: string | null;
  contact_ids: string[];
  deal_id: string | null;
  product: string | null;
  summary: string | null;
  outcome: 'positive' | 'neutral' | 'negative' | 'no_response' | null;
  /** Present in the database and returned by getMeetings() (`select '*'`), but missing
   *  from this type until now. Evidence tiers depend on it: without direction every
   *  logged row is indistinguishable from internal workflow activity. */
  direction?: 'inbound' | 'outbound' | 'internal' | 'unknown' | null;
  followup_date: string | null;
  created_at: string;
}

// ─── Lookup Maps ───
export const STAGE_LABELS: Record<DealStage, string> = {
  research: 'Research',
  contacted: 'Contacted',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

export const STAGE_ORDER: DealStage[] = [
  'research',
  'contacted',
  'proposal',
  'negotiation',
  'closed_won',
];

export const COMPANY_STATUS_LABELS: Record<CompanyStatus, string> = {
  prospect: 'Prospect',
  active_customer: 'Active Customer',
  inactive: 'Inactive',
  lost: 'Lost',
};

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  active: 'Active',
  replied: 'Replied',
  not_interested: 'Not Interested',
  no_response: 'No Response',
  parked: 'Parked',
};

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  call: 'Call',
  email: 'Email',
  dm: 'DM',
  meeting: 'Meeting',
  sample_sent: 'Sample Sent',
  note: 'Note',
  nudge: 'Nudge',
  reward: 'Reward',
};

export const PRODUCT_OPTIONS = [
  'Butter',
  'Condensed Milk',
  'Both',
  'White Chocolate',
  'Custom',
];

export const VALUE_TYPE_LABELS: Record<Value_type, string> = {
  estimated: 'Estimated',
  committed: 'Committed',
  unknown: 'Unknown',
};
