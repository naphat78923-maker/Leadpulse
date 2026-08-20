'use client';

import { useMemo } from 'react';
import { useCrm } from '@/components/CrmProvider';
import { ActivityEntry } from '@/components/CrmProvider';

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const ENTITY_ICONS: Record<string, string> = {
  deal: '💼',
  contact: '👤',
  company: '🏢',
  meeting: '📅',
};

const ACTION_COLORS: Record<string, string> = {
  quick_action: 'text-clay-ochre',
  edit: 'text-clay-ink',
  create: 'text-clay-teal',
  delete: 'text-clay-error',
};

export default function ActivityPage() {
  const { activities, undoActivity } = useCrm();

  const todayActivities = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return activities.filter(a => a.timestamp >= startOfDay.getTime());
  }, [activities]);

  const grouped = useMemo(() => {
    const groups: { [key: string]: ActivityEntry[] } = {};
    todayActivities.forEach(activity => {
      const date = new Date(activity.timestamp);
      const key = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(activity);
    });
    return groups;
  }, [todayActivities]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-clay-ink">Activity</h1>
          <p className="text-sm text-clay-muted mt-0.5">{todayActivities.length} actions today</p>
        </div>
      </div>

      {todayActivities.length === 0 ? (
        <div className="bg-white dark:bg-clay-card rounded-xl border border-clay-hairline p-8 text-center">
          <p className="text-clay-muted text-sm">No activity yet today.</p>
          <p className="text-clay-muted text-xs mt-1">Actions from deals, contacts, and meetings will appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <h2 className="text-xs font-semibold text-clay-muted mb-3 tracking-wider">{date}</h2>
              <div className="space-y-2">
                {items.map(activity => (
                  <div
                    key={activity.id}
                    className="bg-white dark:bg-clay-card rounded-xl border border-clay-hairline p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-xl flex-shrink-0">{ENTITY_ICONS[activity.entity] || '📌'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-medium ${ACTION_COLORS[activity.type] || 'text-clay-ink'}`}>
                            {activity.label}
                          </p>
                          <span className="text-[10px] text-clay-muted whitespace-nowrap">
                            {formatTime(activity.timestamp)}
                          </span>
                        </div>
                        {activity.description && (
                          <p className="text-xs text-clay-muted mt-1">{activity.description}</p>
                        )}
                        {activity.entityId && (
                          <p className="text-[10px] text-clay-muted mt-1 font-mono">ID: {activity.entityId.slice(0, 8)}...</p>
                        )}
                      </div>
                    </div>
                    {activity.undoPayload && (
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] text-clay-muted">Can be undone</span>
                        <button
                          onClick={async () => {
                            const ok = await undoActivity(activity.id);
                            if (!ok) alert('Could not undo this action');
                          }}
                          className="text-xs font-medium text-clay-ochre hover:underline"
                        >
                          Undo
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
