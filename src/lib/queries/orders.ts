import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Order management.
 *
 * Status changes and stock movements go EXCLUSIVELY through the two RPCs from
 * Phase 1. Nothing here writes `status_id` or `stock_on_hand` directly, and the
 * RLS policies would refuse it if it tried.
 *
 * Those functions carry the rules that matter: row locks so two admins cannot
 * confirm the last unit, validated transitions, the stock ledger, the timeline
 * entry, and the Google Sheets queue — all in one transaction that either
 * commits together or not at all.
 *
 * Shipping details and notes are ordinary column updates, permitted by the
 * `orders.update` policy. They carry no business rule and no stock effect.
 */

export interface OrderListRow {
  id: string;
  reference: string;
  first_name: string;
  last_name: string;
  phone_e164: string;
  total: number;
  created_at: string;
  confirmed_at: string | null;
  next_retry_at: string | null;
  unreachable_attempts: number;
  status: { code: string; label_fr: string; label_ar: string; color_hex: string | null };
  wilaya: { name_fr: string; name_ar: string } | null;
}

const LIST_SELECT = `
  id, reference, first_name, last_name, phone_e164, total, created_at,
  confirmed_at, next_retry_at, unreachable_attempts,
  status:order_statuses ( code, label_fr, label_ar, color_hex ),
  wilaya:wilayas ( name_fr, name_ar )
`;

export function useOrders(filter: { status?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['orders', filter.status ?? 'all', filter.search ?? ''],
    queryFn: async (): Promise<OrderListRow[]> => {
      let q = supabase
        .from('orders')
        .select(LIST_SELECT)
        .order('created_at', { ascending: false })
        .limit(100);

      if (filter.status && filter.status !== 'all') {
        const { data: st } = await supabase
          .from('order_statuses')
          .select('id')
          .eq('code', filter.status)
          .single();
        if (st) q = q.eq('status_id', (st as { id: string }).id);
      }

      const search = filter.search?.trim();
      if (search) {
        // Reference or phone: the two things a customer can quote on a call.
        q = q.or(`reference.ilike.%${search}%,phone_e164.ilike.%${search}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as OrderListRow[];
    },
    // Orders arrive while the dashboard is open; keep them reasonably fresh.
    staleTime: 30 * 1000,
  });
}

/** Counts for the dashboard — what needs doing, not vanity metrics. */
export function useOrderCounts() {
  return useQuery({
    queryKey: ['order-counts'],
    queryFn: async () => {
      const codes = ['new', 'pending_confirmation', 'unreachable', 'confirmed', 'shipped'];
      const { data: statuses } = await supabase
        .from('order_statuses')
        .select('id, code')
        .in('code', codes);

      const entries = await Promise.all(
        (statuses ?? []).map(async (s: any) => {
          const { count } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('status_id', s.id);
          return [s.code as string, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
    staleTime: 60 * 1000,
  });
}

export interface OrderDetail extends OrderListRow {
  phone_raw: string;
  address: string | null;
  notes: string | null;
  subtotal: number;
  delivery_fee: number;
  delivery_fee_override: number | null;
  delivery_company_id: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  estimated_delivery_at: string | null;
  commune: { name_fr: string; name_ar: string } | null;
  method: { code: string; label_fr: string; label_ar: string } | null;
  items: {
    id: string;
    product_name_fr: string;
    product_name_ar: string | null;
    color_name_fr: string | null;
    size_label_fr: string | null;
    sku: string;
    unit_price: number;
    quantity: number;
    line_total: number;
    variant_id: string | null;
  }[];
  timeline: {
    id: number;
    event_type: string;
    note: string | null;
    created_at: string;
    actor: { full_name: string } | null;
    from_status: { label_fr: string; label_ar: string } | null;
    to_status: { label_fr: string; label_ar: string } | null;
  }[];
}

export function useOrderDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<OrderDetail> => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `${LIST_SELECT}, phone_raw, address, notes, subtotal, delivery_fee,
           delivery_fee_override, delivery_company_id, tracking_number,
           shipped_at, estimated_delivery_at,
           commune:communes ( name_fr, name_ar ),
           method:delivery_methods ( code, label_fr, label_ar ),
           items:order_items ( id, product_name_fr, product_name_ar, color_name_fr,
             size_label_fr, sku, unit_price, quantity, line_total, variant_id )`,
        )
        .eq('id', id!)
        .single();
      if (error) throw error;

      const { data: timeline } = await supabase
        .from('order_timeline')
        .select(
          `id, event_type, note, created_at,
           actor:admin_users ( full_name ),
           from_status:order_statuses!order_timeline_from_status_id_fkey ( label_fr, label_ar ),
           to_status:order_statuses!order_timeline_to_status_id_fkey ( label_fr, label_ar )`,
        )
        .eq('order_id', id!)
        .order('created_at', { ascending: false });

      return { ...(data as any), timeline: timeline ?? [] } as OrderDetail;
    },
  });
}

export function useOrderStatuses() {
  return useQuery({
    queryKey: ['order-statuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_statuses')
        .select('id, code, label_fr, label_ar, color_hex, sort_order, is_terminal')
        .order('sort_order');
      if (error) throw error;
      return data as {
        id: string;
        code: string;
        label_fr: string;
        label_ar: string;
        color_hex: string | null;
        sort_order: number;
        is_terminal: boolean;
      }[];
    },
    staleTime: Infinity,
  });
}

/** Which transitions are legal from here — the same table the RPC checks. */
export function useAllowedTransitions(statusCode: string | undefined) {
  return useQuery({
    queryKey: ['transitions', statusCode],
    enabled: Boolean(statusCode),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('order_status_transitions')
        .select('from:order_statuses!order_status_transitions_from_status_id_fkey ( code ), to:order_statuses!order_status_transitions_to_status_id_fkey ( code )');
      if (error) throw error;
      return (data as any[])
        .filter((r) => r.from?.code === statusCode)
        .map((r) => r.to?.code as string)
        .filter(Boolean);
    },
    staleTime: Infinity,
  });
}

/* ---------------------------------------------------------------------------
   Mutations — every one of these is a server function
   --------------------------------------------------------------------------- */

export type ConfirmResult =
  | { ok: true; oversold: boolean }
  | {
      ok: false;
      reason: 'already_confirmed' | 'illegal_transition' | 'insufficient_stock' | 'variant_missing';
      lines?: { sku: string; product: string; requested: number; available: number }[];
      from?: string;
    };

export function useConfirmOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      note,
      allowOversell,
    }: {
      orderId: string;
      note?: string;
      allowOversell?: boolean;
    }): Promise<ConfirmResult> => {
      const { data, error } = await supabase.rpc('confirm_order', {
        p_order_id: orderId,
        p_note: note ?? null,
        p_allow_oversell: allowOversell ?? false,
      });
      if (error) throw error;
      return data as ConfirmResult;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['order', v.orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order-counts'] });
    },
  });
}

export function useTransitionOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      toStatus,
      note,
    }: {
      orderId: string;
      toStatus: string;
      note?: string;
    }) => {
      const { data, error } = await supabase.rpc('transition_order_status', {
        p_order_id: orderId,
        p_to_status: toStatus,
        p_note: note ?? null,
      });
      if (error) throw error;
      return data as { ok: boolean; reason?: string; from?: string; to?: string };
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['order', v.orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order-counts'] });
    },
  });
}

/** A call attempt or a free note. Append-only, like every timeline entry. */
export function useAddTimelineNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      note,
      eventType,
    }: {
      orderId: string;
      note: string;
      eventType: 'call_attempt' | 'note_added';
    }) => {
      const { data: me } = await supabase.rpc('my_profile');
      const { error } = await supabase.from('order_timeline').insert({
        order_id: orderId,
        actor_id: (me as { id: string } | null)?.id ?? null,
        event_type: eventType,
        note,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['order', v.orderId] }),
  });
}

/** Shipping block — plain columns, no business rule attached (D-036). */
export function useUpdateShipping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      patch,
    }: {
      orderId: string;
      patch: {
        delivery_company_id?: string | null;
        tracking_number?: string | null;
        shipped_at?: string | null;
        estimated_delivery_at?: string | null;
        delivery_fee_override?: number | null;
        notes?: string | null;
      };
    }) => {
      const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['order', v.orderId] }),
  });
}

export function useDeliveryCompanies() {
  return useQuery({
    queryKey: ['delivery-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_companies')
        .select('id, code, name')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data as { id: string; code: string; name: string }[];
    },
    staleTime: Infinity,
  });
}
