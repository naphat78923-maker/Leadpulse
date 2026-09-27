'use client';

import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Deal } from '@/types/crm';
import { EASE_OUT, tweenBase } from '@/lib/motion';

/* ─── Drag & drop primitives ─── */

export function DraggableCard({
  deal, onClick, landing, reduceMotion, children,
}: {
  deal: Deal;
  onClick: () => void;
  landing?: boolean;
  reduceMotion?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const settling = Boolean(landing) && !reduceMotion && !isDragging;
  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      initial={false}
      animate={
        isDragging
          ? { opacity: 0.4, scale: 1, y: 0 }
          : settling
            ? { opacity: 1, scale: [0.97, 1], y: [6, 0] }
            : { opacity: 1, scale: 1, y: 0 }
      }
      transition={
        settling
          ? { duration: 0.24, ease: EASE_OUT }
          : { duration: 0.15, ease: EASE_OUT }
      }
      className="touch-none cursor-grab active:cursor-grabbing"
    >
      {children}
    </motion.div>
  );
}

export function DroppableLane({
  laneId, className, children, reduceMotion,
}: {
  laneId: string;
  className?: string;
  children: React.ReactNode;
  reduceMotion?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: laneId });
  // Border/bg via className so lane theme restores on drag-out; FM owns the pulse (supersedes CSS .lane-drop-over).
  return (
    <motion.section
      ref={setNodeRef}
      data-lane-id={laneId}
      className={clsx(
        'flex-1 min-w-[12rem] max-w-[18rem] snap-start rounded-xl border border-clay-hairline bg-clay-surface/70 p-2.5 flex flex-col transition-colors 2xl:min-w-[150px]',
        className,
        isOver && 'border-[#7451f2] bg-[rgba(116,81,242,0.04)]'
      )}
      initial={false}
      animate={
        isOver && !reduceMotion
          ? {
              boxShadow: [
                '0 0 0 0 rgba(116, 81, 242, 0)',
                '0 0 0 4px rgba(116, 81, 242, 0.16)',
                '0 0 0 0 rgba(116, 81, 242, 0)',
              ],
            }
          : { boxShadow: '0 0 0 0 rgba(116, 81, 242, 0)' }
      }
      transition={
        isOver && !reduceMotion
          ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }
          : tweenBase
      }
    >
      {children}
    </motion.section>
  );
}
