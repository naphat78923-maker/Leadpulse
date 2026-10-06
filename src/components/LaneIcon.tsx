import { CalendarClock, FlaskConical, MessageCircleMore, Package, Pause, Send, Trophy, type LucideIcon } from 'lucide-react';
import type { DealWorkflowAction } from '@/types/crm';

// Line icons for the journey lanes. The emoji on each lane (deal-workflow.ts) stay for the
// journal and activity log, which are stored text; anything drawn on screen uses these.
const LANE_ICONS: Record<DealWorkflowAction, LucideIcon> = {
  outreach: Send,
  reply: MessageCircleMore,
  sample: Package,
  testing: FlaskConical,
  reschedule: CalendarClock,
  parked: Pause,
  success: Trophy,
};

export default function LaneIcon({ lane, className = 'h-3.5 w-3.5' }: { lane: DealWorkflowAction; className?: string }) {
  const Icon = LANE_ICONS[lane];
  return <Icon className={className} aria-hidden="true" />;
}
