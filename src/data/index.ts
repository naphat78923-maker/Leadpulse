// Real data imported from Google Sheet (75 leads)
// Last imported: see imported-leads.json
// This file re-exports the imported data with generated IDs and timestamps

import { Lead, Interaction } from '@/types/lead';
import importedData from './imported-leads.json';

function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

export const leads: Lead[] = (importedData as any).leads.map((l: any) => ({
  ...l,
  id: generateId(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})) as Lead[];

// Placeholder interactions — Phase 2 will build these from lead history
export const interactions: Interaction[] = [];
