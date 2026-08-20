// ─── LeadPulse CRM — Full Database Schema ───
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
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Contacts ───
export type ContactStatus = 'active' | 'replied' | 'not_interested' | 'no_response' | 'parked';

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
  followup_date: string | null;
  last_outcome: string | null;
  nudge_count: number;
  workflow_action?: DealWorkflowAction | null;
  nudge_stage?: NudgeStage | null;
  sample_status?: SampleStatus | null;
  created_at: string;
  updated_at: string;
}

// ─── Meetings ───
export type MeetingType = 'call' | 'email' | 'dm' | 'meeting' | 'sample_sent' | 'note' | 'nudge';

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
};

export const PRODUCT_OPTIONS = [
  'Butter',
  'Condensed Milk',
  'Both',
  'White Chocolate',
  'Custom',
];
