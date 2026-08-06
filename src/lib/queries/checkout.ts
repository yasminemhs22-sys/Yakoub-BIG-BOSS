import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { CartLine } from '@/lib/cart';

/**
 * Cart resolution.
 *
 * The cart itself holds only variant ids and quantities (D-273). Everything a
 * customer sees — name, colour, size, price, stock — is fetched here from the
 * database, live.
 *
 * That is not a convenience. It means the displayed price is always the real
 * one, a product removed from sale disappears from the basket, and no figure a
 * customer sees originates in their own browser.
 */

export interface ResolvedLine {
  variantId: string;
  quantity: number;
  productSlug: string;
  nameFr: string;
  nameAr: string | null;
  colorFr: string | null;
  colorAr: string | null;
  sizeFr: string | null;
  sizeAr: string | null;
  sku: string;
  unitPrice: number;
  stock: number;
  imagePath: string | null;
  /** Set when the variant vanished or its product was unpublished. */
  unavailable: boolean;
}

export function useResolvedCart(lines: CartLine[]) {
  const ids = lines.map((l) => l.variantId).sort();
  return useQuery({
    queryKey: ['cart-resolve', ids.join(',')],
    enabled: ids.length > 0,
    // Prices must be current at the moment of viewing, not cached from earlier.
    staleTime: 0,
    queryFn: async (): Promise<ResolvedLine[]> => {
      const { data, error } = await supabase
        .from('product_variants')
        .select(
          `id, sku, price_adjustment, stock_on_hand, is_active,
           colors ( name_fr, name_ar ),
           sizes ( label_fr, label_ar ),
           products!inner ( slug, name_fr, name_ar, original_price, sale_price, is_published,
             product_media ( is_featured, sort_order, media ( storage_path ) ) )`,
        )
        .in('id', ids);

      if (error) throw error;
      const rows = (data ?? []) as any[];

      return lines.map((line) => {
        const v = rows.find((r) => r.id === line.variantId);
        if (!v || !v.is_active || !v.products?.is_published) {
          return {
            variantId: line.variantId,
            quantity: line.quantity,
            productSlug: '',
            nameFr: '',
            nameAr: null,
            colorFr: null,
            colorAr: null,
            sizeFr: null,
            sizeAr: null,
            sku: '',
            unitPrice: 0,
            stock: 0,
            imagePath: null,
            unavailable: true,
          };
        }

        const p = v.products;
        const media = (p.product_media ?? []).slice().sort(
          (a: any, b: any) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0) || a.sort_order - b.sort_order,
        );

        return {
          variantId: v.id,
          quantity: line.quantity,
          productSlug: p.slug,
          nameFr: p.name_fr,
          nameAr: p.name_ar,
          colorFr: v.colors?.name_fr ?? null,
          colorAr: v.colors?.name_ar ?? null,
          sizeFr: v.sizes?.label_fr ?? null,
          sizeAr: v.sizes?.label_ar ?? null,
          sku: v.sku,
          // Mirrors the server: active price plus the variant adjustment.
          unitPrice: (p.sale_price ?? p.original_price) + (v.price_adjustment ?? 0),
          stock: v.stock_on_hand,
          imagePath: media[0]?.media?.storage_path ?? null,
          unavailable: false,
        };
      });
    },
  });
}

/**
 * Delivery fee, resolved by the DATABASE function, not computed here.
 *
 * The same function `place_order` uses, so the figure the customer sees during
 * checkout cannot drift from the figure written onto the order.
 */
export function useResolvedDeliveryFee(
  wilayaId: string | null,
  communeId: string | null,
  methodId: string | null,
) {
  return useQuery({
    queryKey: ['delivery-fee', wilayaId, communeId, methodId],
    enabled: Boolean(wilayaId && communeId && methodId),
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase.rpc('resolve_delivery_fee', {
        p_wilaya_id: wilayaId,
        p_commune_id: communeId,
        p_method_id: methodId,
      });
      if (error) throw error;
      return data === null ? null : Number(data);
    },
  });
}

export interface PlaceOrderInput {
  firstName: string;
  lastName: string;
  phone: string;
  wilayaId: string;
  communeId: string;
  methodId: string;
  address?: string;
  notes?: string;
  items: CartLine[];
  honeypot?: string;
}

export type PlaceOrderResult =
  | { ok: true; reference: string; total: number }
  | { ok: false; reason: string; lines?: unknown };

/**
 * Submits the order.
 *
 * Note what is NOT sent: no price, no delivery fee, no total. Only who the
 * customer is, where it goes, and which variants in what quantity. The server
 * computes every figure from the database (D-274).
 *
 * Placing an order does not reserve stock (D-041) — that happens only when the
 * administrator confirms by phone.
 */
export function usePlaceOrder() {
  return useMutation({
    mutationFn: async (input: PlaceOrderInput): Promise<PlaceOrderResult> => {
      // Routed through a Netlify Function rather than straight to Supabase, so
      // the real client IP reaches place_order and the per-IP rate limit
      // actually works (Phase 11). The browser cannot supply a trustworthy
      // address, and a forged one would make the limit worse than none.
      //
      // Still no price, no total, no delivery fee — the server computes every
      // figure from the database (D-274).
      const response = await fetch('/.netlify/functions/place-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          p_first_name: input.firstName,
          p_last_name: input.lastName,
          p_phone: input.phone,
          p_wilaya_id: input.wilayaId,
          p_commune_id: input.communeId,
          p_method_id: input.methodId,
          p_address: input.address ?? null,
          p_notes: input.notes ?? null,
          p_items: input.items.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
          p_honeypot: input.honeypot ?? null,
        }),
      });

      if (!response.ok) return { ok: false, reason: 'generic' };
      return (await response.json()) as PlaceOrderResult;
    },
  });
}

export interface TrackedOrder {
  reference: string;
  created_at: string;
  total: number;
  status_code: string;
  label_fr: string;
  label_ar: string;
  tracking_number: string | null;
  estimated_delivery_at: string | null;
}

/** Tracking needs BOTH the reference and the phone (D-059). */
export function useTrackOrder() {
  return useMutation({
    mutationFn: async ({ reference, phone }: { reference: string; phone: string }) => {
      const { data, error } = await supabase.rpc('track_order', {
        p_reference: reference,
        p_phone: phone,
      });
      if (error) throw error;
      return data as { ok: boolean; order?: TrackedOrder };
    },
  });
}
