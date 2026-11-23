import { useCallback, useEffect, useState } from 'react';
import type { ResellerLead } from '../../data/schema';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useCatalog } from '../../store/catalog';
import { signalSessionLost } from './session';

export const fetchLeads = () => api<{ leads: ResellerLead[] }>('/api/admin/leads', { retries: 2 }).then((r) => r.leads);

export const deleteLead = (id: string) => api<{ deleted: boolean }>(`/api/admin/leads/${encodeURIComponent(id)}`, { method: 'DELETE', retries: 1 });

type LeadsState = { status: 'loading' } | { status: 'ready'; leads: ResellerLead[] } | { status: 'error'; message: string };

/** Reseller leads from the server; refetches when the live channel reports a change. */
export function useLeads(): { state: LeadsState; reload: () => void; remove: (id: string) => Promise<string | null> } {
  const [state, setState] = useState<LeadsState>({ status: 'loading' });
  const leadsVersion = useCatalog((s) => s.leadsVersion);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    fetchLeads().then(
      (leads) => active && setState({ status: 'ready', leads }),
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.code === 'unauthenticated') signalSessionLost();
        setState((s) => (s.status === 'ready' ? s : { status: 'error', message: errorMessage(error) }));
      },
    );
    return () => {
      active = false;
    };
  }, [leadsVersion, tick]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setTick((t) => t + 1);
  }, []);

  /** Deletes a lead; resolves to an error message, or null on success. */
  const remove = useCallback(async (id: string) => {
    try {
      await deleteLead(id);
      setState((s) => (s.status === 'ready' ? { status: 'ready', leads: s.leads.filter((l) => l.id !== id) } : s));
      return null;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthenticated') signalSessionLost();
      return errorMessage(error);
    }
  }, []);

  return { state, reload, remove };
}
