import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ContentBlock } from '@/lib/blocks';

/**
 * Storefront reads.
 *
 * Every query here runs with the anon key, so Row Level Security is what
 * decides what comes back — unpublished products and invisible categories are
 * filtered by the database, not by these functions. The `.eq('is_published')`
 * filters below are for clarity and index use, not for security.
 *
 * Columns are always listed explicitly. `select('*')` on a product page would
 * ship SEO metadata and admin fields to every visitor on a 3G connection.
 */

export interface StorefrontProduct {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string | null;
  original_price: number;
  sale_price: number | null;
  featured_path: string | null;
  featured_alt_fr: string | null;
  featured_alt_ar: string | null;
}

const PRODUCT_CARD_SELECT = `
  id, slug, name_fr, name_ar, original_price, sale_price,
  product_media!inner ( is_featured, media ( storage_path, alt_fr, alt_ar ) )
`;

interface RawProductCard {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string | null;
  original_price: number;
  sale_price: number | null;
  product_media: {
    is_featured: boolean;
    media: { storage_path: string; alt_fr: string | null; alt_ar: string | null } | null;
  }[];
}

function toCard(row: RawProductCard): StorefrontProduct {
  const featured = row.product_media.find((m) => m.is_featured) ?? row.product_media[0];
  return {
    id: row.id,
    slug: row.slug,
    name_fr: row.name_fr,
    name_ar: row.name_ar,
    original_price: row.original_price,
    sale_price: row.sale_price,
    featured_path: featured?.media?.storage_path ?? null,
    featured_alt_fr: featured?.media?.alt_fr ?? null,
    featured_alt_ar: featured?.media?.alt_ar ?? null,
  };
}

export function usePublishedProducts(opts: { limit?: number; categorySlug?: string } = {}) {
  const { limit = 24, categorySlug } = opts;
  return useQuery({
    queryKey: ['sf-products', limit, categorySlug ?? null],
    queryFn: async (): Promise<StorefrontProduct[]> => {
      let q = supabase
        .from('products')
        .select(
          categorySlug
            ? `${PRODUCT_CARD_SELECT}, product_categories!inner ( categories!inner ( slug ) )`
            : PRODUCT_CARD_SELECT,
        )
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(limit);

      if (categorySlug) q = q.eq('product_categories.categories.slug', categorySlug);

      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as RawProductCard[]).map(toCard);
    },
  });
}

export function useProductsByIds(ids: string[]) {
  return useQuery({
    queryKey: ['sf-products-by-id', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<StorefrontProduct[]> => {
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_CARD_SELECT)
        .eq('is_published', true)
        .in('id', ids);
      if (error) throw error;
      // Preserve the curator's order, which `in()` does not guarantee. The
      // whole point of a manual shelf is that the sequence was chosen.
      const cards = (data as unknown as RawProductCard[]).map(toCard);
      return ids.map((id) => cards.find((c) => c.id === id)).filter(Boolean) as StorefrontProduct[];
    },
  });
}

/* --------------------------------------------------------------------------- */

export interface ProductDetail {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string | null;
  description_fr: string | null;
  description_ar: string | null;
  size_guide_fr: string | null;
  size_guide_ar: string | null;
  care_info_fr: string | null;
  care_info_ar: string | null;
  original_price: number;
  sale_price: number | null;
  meta_title_fr: string | null;
  meta_title_ar: string | null;
  meta_description_fr: string | null;
  meta_description_ar: string | null;
  media: { id: string; storage_path: string; alt_fr: string | null; alt_ar: string | null }[];
  variants: {
    id: string;
    color_id: string | null;
    size_id: string | null;
    sku: string;
    price_adjustment: number;
    stock_on_hand: number;
  }[];
  colors: { id: string; name_fr: string; name_ar: string | null; hex_value: string }[];
  sizes: { id: string; label_fr: string; label_ar: string | null; sort_order: number }[];
}

export function useProductDetail(slug: string | undefined) {
  return useQuery({
    queryKey: ['sf-product', slug],
    enabled: Boolean(slug),
    queryFn: async (): Promise<ProductDetail | null> => {
      const { data, error } = await supabase
        .from('products')
        .select(
          `id, slug, name_fr, name_ar, description_fr, description_ar,
           size_guide_fr, size_guide_ar, care_info_fr, care_info_ar,
           original_price, sale_price,
           meta_title_fr, meta_title_ar, meta_description_fr, meta_description_ar,
           product_media ( id, sort_order, is_featured, media ( storage_path, alt_fr, alt_ar ) ),
           product_variants ( id, color_id, size_id, sku, price_adjustment, stock_on_hand, is_active )`,
        )
        .eq('slug', slug!)
        .eq('is_published', true)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as any;
      const media = (row.product_media ?? [])
        .sort((a: any, b: any) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0) || a.sort_order - b.sort_order)
        .map((m: any) => ({
          id: m.id,
          storage_path: m.media?.storage_path ?? '',
          alt_fr: m.media?.alt_fr ?? null,
          alt_ar: m.media?.alt_ar ?? null,
        }));

      const variants = (row.product_variants ?? []).filter((v: any) => v.is_active);

      // Fetch only the colours and sizes this product actually uses.
      const colorIds = [...new Set(variants.map((v: any) => v.color_id).filter(Boolean))];
      const sizeIds = [...new Set(variants.map((v: any) => v.size_id).filter(Boolean))];

      const [colorsRes, sizesRes] = await Promise.all([
        colorIds.length
          ? supabase.from('colors').select('id, name_fr, name_ar, hex_value').in('id', colorIds)
          : Promise.resolve({ data: [], error: null }),
        sizeIds.length
          ? supabase
              .from('sizes')
              .select('id, label_fr, label_ar, sort_order')
              .in('id', sizeIds)
              .order('sort_order')
          : Promise.resolve({ data: [], error: null }),
      ]);

      return {
        ...row,
        media,
        variants,
        colors: (colorsRes.data ?? []) as ProductDetail['colors'],
        sizes: (sizesRes.data ?? []) as ProductDetail['sizes'],
      } as ProductDetail;
    },
  });
}

/* --------------------------------------------------------------------------- */

export function useVisibleCategories() {
  return useQuery({
    queryKey: ['sf-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, slug, name_fr, name_ar, parent_id, sort_order, media_id')
        .eq('is_visible', true)
        .order('sort_order');
      if (error) throw error;
      return data as {
        id: string;
        slug: string;
        name_fr: string;
        name_ar: string | null;
        parent_id: string | null;
        sort_order: number;
        media_id: string | null;
      }[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function usePageWithBlocks(slug: string) {
  return useQuery({
    queryKey: ['sf-page', slug],
    queryFn: async () => {
      const { data: page, error } = await supabase
        .from('pages')
        .select(
          'id, slug, title_fr, title_ar, meta_title_fr, meta_title_ar, meta_description_fr, meta_description_ar',
        )
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();
      if (error) throw error;
      if (!page) return null;

      const { data: blocks } = await supabase
        .from('content_blocks')
        .select('id, page_id, block_type, position, is_visible, data')
        .eq('page_id', (page as { id: string }).id)
        .eq('is_visible', true)
        .order('position');

      return { page: page as Record<string, string>, blocks: (blocks ?? []) as ContentBlock[] };
    },
  });
}

/* ---------------------------------------------------------------------------
   Geography and delivery
   --------------------------------------------------------------------------- */

export function useWilayas() {
  return useQuery({
    queryKey: ['wilayas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wilayas')
        .select('id, code, name_fr, name_ar')
        .eq('is_active', true)
        .order('code');
      if (error) throw error;
      return data as { id: string; code: number; name_fr: string; name_ar: string }[];
    },
    // 58 rows that never change during a session.
    staleTime: Infinity,
  });
}

/**
 * Communes are fetched per selected wilaya and NEVER bundled (D-267, C-06).
 *
 * All 1,541 communes would consume a large share of the 200KB JS budget. This
 * fetches ~27 rows on demand, which is the difference between a usable and an
 * unusable checkout on 3G.
 */
export function useCommunes(wilayaId: string | null) {
  return useQuery({
    queryKey: ['communes', wilayaId],
    enabled: Boolean(wilayaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communes')
        .select('id, name_fr, name_ar')
        .eq('wilaya_id', wilayaId!)
        .eq('is_active', true)
        .order('name_fr');

      if (error) throw error;

      return data as {
        id: string;
        name_fr: string;
        name_ar: string;
      }[];
    },
    staleTime: Infinity,
  });
}

export function useDeliveryMethods() {
  return useQuery({
    queryKey: ['delivery-methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_methods')
        .select('id, code, label_fr, label_ar, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data as {
        id: string;
        code: string;
        label_fr: string;
        label_ar: string;
        sort_order: number;
      }[];
    },
    staleTime: Infinity,
  });
}

/** Wilaya-level prices for both methods, resolved client-side for the estimator. */
export function useDeliveryPrices(wilayaId: string | null) {
  return useQuery({
    queryKey: ['delivery-prices', wilayaId],
    enabled: Boolean(wilayaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_prices')
        .select('delivery_method_id, commune_id, price')
        .eq('wilaya_id', wilayaId!)
        .eq('is_active', true);
      if (error) throw error;
      return data as { delivery_method_id: string; commune_id: string | null; price: number }[];
    },
    staleTime: 10 * 60 * 1000,
  });
}
