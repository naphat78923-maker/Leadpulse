// Lane → blob-state mapping for the mascot sweep.
// Workflow lanes render as blob moods instead of the old hex/PNG mascots.

import type { DealWorkflowAction } from '@/types/crm'
import type { BlobState } from '@/components/blob'

export const LANE_BLOB_STATE: Record<DealWorkflowAction, BlobState> = {
  outreach: 'nudge', // proactive reach
  reply: 'thinking', // waiting on them, assessing
  sample: 'nudge',
  testing: 'thinking',
  reschedule: 'thinking',
  parked: 'sleep',
  success: 'joy',
}
