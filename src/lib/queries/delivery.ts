import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Delivery pricing.
 *
 * Every wilaya needs a price for both methods before it can receive an order —
 * `place_order` returns `no_delivery_price` otherwise. This screen is therefore
 * a launch blocker, not a nicety.
 */
export interface WilayaPriceRow {
  wilaya_id: string;
  code: number;
  name_fr: string;
  name_ar: string;
  bureau: number | null;
  domicile: number | null;
}

export function useWilayaPrices() {
  return useQuery({
    queryKey: ['wilaya-prices'],
    queryFn: async (): Promise<WilayaPriceRow[]> => {
      const [wilayas, methods, prices] = await Promise.all([
        supabase.from('wilayas').select('id, code, name_fr, name_ar').order('code'),
        supabase.from('delivery_methods').select('id, code'),
        supabase
          .from('delivery_prices')
          .select('wilaya_id, delivery_method_id, price')
          .is('commune_id', null),
      ]);

      if (wilayas.error) throw wilayas.error;

      const methodByCode = Object.fromEntries(
        (methods.data ?? []).map((m: any) => [m.code, m.id as string]),
      );

      return (wilayas.data ?? []).map((w: any) => {
        const find = (code: string) =>
          (prices.data ?? []).find(
            (p: any) => p.wilaya_id === w.id && p.delivery_method_id === methodByCode[code],
          )?.price ?? null;

        return {
          wilaya_id: w.id,
          code: w.code,
          name_fr: w.name_fr,
          name_ar: w.name_ar,
          bureau: find('bureau'),
          domicile: find('domicile'),
        };
      });
    },
  });
}

export function useSetDeliveryPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      wilayaId,
      methodCode,
      price,
    }: {
      wilayaId: string;
      methodCode: 'bureau' | 'domicile';
      price: number | null;
    }) => {
      const { data: method } = await supabase
        .from('delivery_methods')
        .select('id')
        .eq('code', methodCode)
        .single();
      if (!method) throw new Error('method not found');
      const methodId = (method as { id: string }).id;

      if (price === null) {
        const { error } = await supabase
          .from('delivery_prices')
          .delete()
          .eq('wilaya_id', wilayaId)
          .eq('delivery_method_id', methodId)
          .is('commune_id', null);
        if (error) throw error;
        return;
      }

      // The unique constraint uses NULLS NOT DISTINCT, so upsert on the
      // wilaya-level row works without a separate existence check.
      const { error } = await supabase
        .from('delivery_prices')
        .upsert(
          { wilaya_id: wilayaId, commune_id: null, delivery_method_id: methodId, price },
          { onConflict: 'wilaya_id,commune_id,delivery_method_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wilaya-prices'] }),
  });
}

/** Bulk fill — 58 wilayas by hand is how a launch gets delayed a week. */
export function useBulkSetPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      wilayaIds,
      bureau,
      domicile,
    }: {
      wilayaIds: string[];
      bureau: number | null;
      domicile: number | null;
    }) => {
      const { data: methods } = await supabase.from('delivery_methods').select('id, code');
      const byCode = Object.fromEntries((methods ?? []).map((m: any) => [m.code, m.id as string]));

      const rows: object[] = [];
      for (const wilayaId of wilayaIds) {
        if (bureau !== null)
          rows.push({
            wilaya_id: wilayaId,
            commune_id: null,
            delivery_method_id: byCode['bureau'],
            price: bureau,
          });
        if (domicile !== null)
          rows.push({
            wilaya_id: wilayaId,
            commune_id: null,
            delivery_method_id: byCode['domicile'],
            price: domicile,
          });
      }
      if (!rows.length) return;

      const { error } = await supabase
        .from('delivery_prices')
        .upsert(rows, { onConflict: 'wilaya_id,commune_id,delivery_method_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wilaya-prices'] }),
  });
}
