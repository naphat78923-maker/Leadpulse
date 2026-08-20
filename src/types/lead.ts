export type LeadStage =
  | 'research_first'
  | 'contacted'
  | 'needs_to_send_details'
  | 'testing_waiting_feedback'
  | 'success'
  | 'not_interested'
  | 'revisit'
  | 'sample_sending';

export type Priority = 'high' | 'medium' | 'low';
export type ProductInterest = 'butter' | 'condensed_milk' | 'both';
export type CustomerSize = 'A' | 'B' | 'C';
export type DealPotential = 'high' | 'medium' | 'low';
export type NudgeType = 'initial_followup' | 'value_add_nudge' | 'light_touch' | 'final_notice';

export interface Lead {
  id: string;
  stage: LeadStage;
  client_name: string;
  type: string;
  priority: Priority;
  next_action: string | null;
  next_followup_date: string | null; // ISO date
  latest_contact_date: string | null;
  lead_stage: string;
  product_interest: ProductInterest;
  contact_person: string | null;
  role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_line: string | null;
  decision_maker: boolean | null;
  last_outcome: string | null;
  deal_potential: DealPotential;
  lead_score: string | null;
  customer_size: CustomerSize;
  notes: string | null;
  contact_source: string | null;
  captured_by: string | null;
  sample_delivery_address: string | null;
  owner: string | null;
  last_nudge_date: string | null;
  nudge_count: number;
  last_nudge_type: string | null;
  days_since_contact: number | null;
  created_at: string;
  updated_at: string;
}

export interface Interaction {
  id: string;
  lead_id: string;
  type: 'call' | 'email' | 'meeting' | 'note' | 'nudge' | 'sample_sent';
  summary: string;
  outcome: 'positive' | 'neutral' | 'negative' | 'no_response' | null;
  followup_date: string | null;
  created_at: string;
}

export const STAGE_LABELS: Record<LeadStage, string> = {
  research_first: 'Research first',
  contacted: 'Contacted',
  needs_to_send_details: 'Needs to send details',
  testing_waiting_feedback: 'Testing / waiting feedback',
  success: 'Success',
  not_interested: 'Not interested',
  revisit: 'Revisit',
  sample_sending: 'Sample sending',
};

export const STAGE_ORDER: LeadStage[] = [
  'research_first',
  'contacted',
  'needs_to_send_details',
  'testing_waiting_feedback',
  'success',
];

export const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-gray-100 text-gray-800 border-gray-200',
};

export const STAGE_COLORS: Record<LeadStage, string> = {
  research_first: 'bg-blue-50 border-blue-200',
  contacted: 'bg-purple-50 border-purple-200',
  needs_to_send_details: 'bg-orange-50 border-orange-200',
  testing_waiting_feedback: 'bg-cyan-50 border-cyan-200',
  success: 'bg-green-50 border-green-200',
  not_interested: 'bg-gray-50 border-gray-200',
  revisit: 'bg-amber-50 border-amber-200',
  sample_sending: 'bg-indigo-50 border-indigo-200',
};
