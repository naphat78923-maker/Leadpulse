'use client';

import { useState, useMemo } from 'react';
import { Meeting, MEETING_TYPE_LABELS } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { meetings as dataMeetings } from '@/data/crmData';
import LogInteractionModal from '@/components/LogInteractionModal';
import { Search, Plus, Calendar, Mail, Phone, Users, FileText, Package, Bell, MessageCircle } from 'lucide-react';
import clsx from 'clsx';

type ViewMode = 'meetings' | 'all_activities';

export default function MeetingsPage() {
  const [view, setView] = useState<ViewMode>('meetings');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { meetings: dbMeetings, contacts, deals, loading, addMeeting } = useCrm();
  const meetings: Meeting[] = dbMeetings.length > 0 ? dbMeetings : (dataMeetings as any);

  const filtered = useMemo(() => {
    let result = meetings;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        m.description.toLowerCase().includes(q) ||
        (m.summary && m.summary.toLowerCase().includes(q))
      );
    }
    return result;
  }, [meetings, search]);

  const groupedByMonth = useMemo(() => {
    const groups: Record<string, Meeting[]> = {};
    filtered.forEach(m => {
      const date = new Date(m.date);
      const key = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    });
    return groups;
  }, [filtered]);

  const getIcon = (type: Meeting['type']) => {
    switch (type) {
      case 'meeting': return <Users className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      case 'call': return <Phone className="w-4 h-4" />;
      case 'dm': return <MessageCircle className="w-4 h-4" />;
      case 'sample_sent': return <Package className="w-4 h-4" />;
      case 'nudge': return <Bell className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getIconColor = (type: Meeting['type']) => {
    switch (type) {
      case 'meeting': return 'bg-clay-lavender/20 text-clay-lavender';
      case 'email': return 'bg-clay-pink/20 text-clay-pink';
      case 'call': return 'bg-clay-mint/20 text-clay-teal';
      case 'dm': return 'bg-zams-powder/50 text-zams-deep';
      case 'sample_sent': return 'bg-clay-ochre/20 text-clay-ochre';
      case 'nudge': return 'bg-clay-coral/20 text-clay-coral';
      default: return 'bg-clay-card text-clay-muted';
    }
  };

  const handleSave = async (meeting: Omit<Meeting, 'id' | 'created_at'>) => {
    // Let errors bubble to the modal so failures are visible.
    await addMeeting(meeting);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><p className="text-clay-muted">Loading...</p></div>;
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-clay-ink tracking-tight">Meetings</h1>
          <p className="text-sm text-clay-muted mt-0.5">{meetings.length} total interactions</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-clay-card rounded-lg p-0.5">
            <button
              onClick={() => setView('meetings')}
              className={clsx('px-3 py-1.5 text-xs font-medium rounded-md transition-colors', view === 'meetings' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}
            >
              Meetings
            </button>
            <button
              onClick={() => setView('all_activities')}
              className={clsx('px-3 py-1.5 text-xs font-medium rounded-md transition-colors', view === 'all_activities' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}
            >
              All Activities
            </button>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg hover:opacity-85"
          >
            <Plus className="w-4 h-4" /> Log Interaction
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-clay-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search meetings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-clay-ink"
          />
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {Object.entries(groupedByMonth).map(([month, items]) => (
          <div key={month}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-clay-muted" />
              <h3 className="text-sm font-semibold text-clay-ink">{month}</h3>
              <span className="text-xs text-clay-muted bg-clay-card px-2 py-0.5 rounded-full">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map(meeting => (
                <div key={meeting.id} className="bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-4 clay-card">
                  <div className="flex items-start gap-3">
                    <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', getIconColor(meeting.type))}>
                      {getIcon(meeting.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-clay-ink">{meeting.description}</h4>
                      </div>
                      {meeting.summary && (
                        <p className="text-xs text-clay-muted line-clamp-2 mb-2">{meeting.summary}</p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-medium text-clay-muted bg-clay-card px-1.5 py-0.5 rounded">
                          {MEETING_TYPE_LABELS[meeting.type]}
                        </span>
                        <span className="text-[10px] text-clay-muted-soft">{meeting.date}</span>
                        {meeting.outcome && (
                          <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded',
                            meeting.outcome === 'positive' ? 'bg-clay-success/10 text-clay-success' :
                            meeting.outcome === 'negative' ? 'bg-clay-error/10 text-clay-error' :
                            'bg-clay-card text-clay-muted'
                          )}>
                            {meeting.outcome}
                          </span>
                        )}
                        {meeting.followup_date && (
                          <span className="text-[10px] text-clay-muted">
                            → {meeting.followup_date}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Log Interaction Modal */}
      <LogInteractionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        deals={deals}
        contacts={contacts}
        companies={[]}
      />
    </div>
  );
}
