'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Company, Contact, Deal, Meeting } from '@/types/crm';
import * as crm from '@/lib/crm';

export type ActivityType = 'quick_action' | 'edit' | 'create' | 'delete';

export interface ActivityEntry {
  id: string;
  timestamp: number;
  type: ActivityType;
  entity: 'deal' | 'contact' | 'company' | 'meeting';
  entityId?: string;
  label: string;
  description?: string;
  undoPayload?: Record<string, any>;
  applied?: boolean;
}

interface CrmContextType {
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  meetings: Meeting[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addMeeting: (meeting: Omit<Meeting, 'id' | 'created_at'>) => Promise<void>;
  createContact: (contact: Omit<Contact, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  createCompany: (company: Omit<Company, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  createDeal: (deal: Omit<Deal, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  activities: ActivityEntry[];
  logActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void;
  markActivityApplied: (id: string) => void;
  undoActivity: (id: string) => Promise<boolean>;
}

const CrmContext = createContext<CrmContextType>({
  companies: [],
  contacts: [],
  deals: [],
  meetings: [],
  loading: true,
  error: null,
  refresh: async () => {},
  addMeeting: async () => {},
  createContact: async () => {},
  createCompany: async () => {},
  createDeal: async () => {},
  activities: [],
  logActivity: () => {},
  markActivityApplied: () => {},
  undoActivity: async () => false,
});

export function CrmProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const initialized = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [companiesRes, contactsRes, dealsRes, meetingsRes] = await Promise.all([
        crm.getCompanies(),
        crm.getContacts(),
        crm.getDeals(),
        crm.getMeetings(),
      ]);

      const mCompanies = (companiesRes || []) as any[];
      const mContacts = (contactsRes || []) as any[];
      const mDeals = (dealsRes || []) as any[];
      const mMeetings = (meetingsRes || []) as any[];

      setCompanies(mCompanies.map((el: any) => ({
        id: el.id,
        name: el.name,
        status: el.status,
        lead_source: el.lead_source,
        account_owner: el.account_owner || 'Pat',
        tags: el.tags || [],
        industry: el.industry,
        size: el.size,
        address: el.address,
        website: el.website,
        notes: el.notes,
        created_at: el.created_at || new Date().toISOString(),
        updated_at: el.updated_at || new Date().toISOString(),
      })) as any);

      setContacts(mContacts.map((el: any) => ({
        id: el.id,
        name: el.name,
        email: el.email,
        phone: el.phone,
        phone_second: el.phone_second,
        line: el.line,
        job_title: el.job_title,
        company_id: el.company_id,
        status: el.status,
        notes: el.notes,
        last_contacted_date: el.last_contacted_date,
        created_at: el.created_at || new Date().toISOString(),
        updated_at: el.updated_at || new Date().toISOString(),
      })) as any);

      setDeals(mDeals.map((el: any) => ({
        id: el.id,
        title: el.title,
        stage: el.stage,
        product: el.product,
        client: el.client,
        company_id: el.company_id,
        contact_ids: el.contact_ids || [],
        value: el.value,
        priority: el.priority,
        next_action: el.next_action,
        followup_date: el.followup_date,
        last_outcome: el.last_outcome,
        nudge_count: el.nudge_count || 0,
        workflow_action: el.workflow_action || undefined,
        nudge_stage: el.nudge_stage || null,
        sample_status: el.sample_status || null,
        created_at: el.created_at || new Date().toISOString(),
        updated_at: el.updated_at || new Date().toISOString(),
      })) as any);

      setMeetings(mMeetings.map((el: any) => ({
        id: el.id,
        description: el.description,
        type: el.type,
        date: el.date,
        company_id: el.company_id,
        contact_ids: el.contact_ids || [],
        deal_id: el.deal_id,
        product: el.product,
        summary: el.summary,
        outcome: el.outcome,
        followup_date: el.followup_date,
        created_at: el.created_at || new Date().toISOString(),
        updated_at: el.updated_at || new Date().toISOString(),
      })) as any);

      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load CRM data');
    } finally {
      setLoading(false);
    }
  }, []);

  const logActivity = useCallback((entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => {
    const activity: ActivityEntry = {
      ...entry,
      id: Math.random().toString(36).slice(2, 9),
      timestamp: Date.now(),
    };
    setActivities(prev => [activity, ...prev].slice(0, 200));
  }, []);

  const markActivityApplied = useCallback((id: string) => {
    setActivities(prev => prev.map(a => a.id === id ? { ...a, applied: true } : a));
  }, []);

  const undoActivity = useCallback(async (id: string) => {
    const activity = activities.find(a => a.id === id);
    if (!activity?.undoPayload || activity.applied === false) return false;

    try {
      if (activity.entity === 'deal' && activity.entityId) {
        await crm.updateDeal(activity.entityId, activity.undoPayload);
      }
      setActivities(prev => prev.map(a => a.id === id ? { ...a, applied: false } : a));
      await refresh();
      return true;
    } catch (err) {
      console.error('Undo activity failed:', err);
      return false;
    }
  }, [activities, refresh]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      refresh();
    }
  }, [refresh]);

  return (
    <CrmContext.Provider value={{
      companies,
      contacts,
      deals,
      meetings,
      loading,
      error,
      refresh,
      addMeeting: async (meeting) => {
        await crm.createMeeting(meeting);
        await refresh();
      },
      createContact: async (contact) => {
        await crm.createContact(contact);
        await refresh();
      },
      createCompany: async (company) => {
        await crm.createCompany(company);
        await refresh();
      },
      createDeal: async (deal) => {
        await crm.createDeal(deal);
        await refresh();
      },
      activities,
      logActivity,
      markActivityApplied,
      undoActivity,
    }}>
      {children}
    </CrmContext.Provider>
  );
}

export function useCrm() {
  return useContext(CrmContext);
}
