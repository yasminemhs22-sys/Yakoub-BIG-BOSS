import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface SyncHealth {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  exhausted: number;
  last_error: string | null;
  last_synced_at: string | null;
}

/**
 * Queue health for the dashboard panel (D-156).
 *
 * The owner must be able to see at a glance that orders are reaching the
 * spreadsheet — and, more importantly, when they are not. A silent integration
 * failure is one nobody notices until the month-end reconciliation.
 */
export function useSyncHealth() {
  return useQuery({
    queryKey: ['sheets-health'],
    queryFn: async (): Promise<SyncHealth> => {
      const { data, error } = await supabase.rpc('sheets_sync_health');
      if (error) throw error;
      return data as SyncHealth;
    },
    refetchInterval: 60 * 1000,
  });
}

export function useFailedSyncs() {
  return useQuery({
    queryKey: ['sheets-failed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sheets_sync_queue')
        .select('id, order_id, status, attempts, last_error, updated_at, orders ( reference )')
        .in('status', ['failed', 'pending'])
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as {
        id: number;
        order_id: string;
        status: string;
        attempts: number;
        last_error: string | null;
        updated_at: string;
        orders: { reference: string } | null;
      }[];
    },
  });
}

/** Resets attempts so an exhausted row can be pushed again once fixed. */
export function useRequeueSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('requeue_sheets_sync', { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sheets-health'] });
      qc.invalidateQueries({ queryKey: ['sheets-failed'] });
    },
  });
}
