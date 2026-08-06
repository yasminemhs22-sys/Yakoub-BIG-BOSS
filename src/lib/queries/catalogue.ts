import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/* ---------------------------------------------------------------------------
   Types — mirrors of the Phase 1 schema.
   Replaced by generated types once `supabase gen types` has been run.
   --------------------------------------------------------------------------- */

export interface CategoryRow {
  id: string;
  parent_id: string | null;
  slug: string;
  name_fr: string;
  name_ar: string | null;
  description_fr: string | null;
  description_ar: string | null;
  media_id: string | null;
  sort_order: number;
  is_visible: boolean;
}

export interface SizeRow {
  id: string;
  label_fr: string;
  label_ar: string | null;
  size_group: 'alpha' | 'numeric' | 'one_size' | 'custom';
  sort_order: number;
  is_active: boolean;
}

export interface ColorRow {
  id: string;
  name_fr: string;
  name_ar: string | null;
  hex_value: string;
  sort_order: number;
  is_active: boolean;
}

export interface ProductRow {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string | null;
  description_fr: string | null;
  description_ar: string | null;
  care_info_fr: string | null;
  care_info_ar: string | null;
  size_guide_fr: string | null;
  size_guide_ar: string | null;
  original_price: number;
  sale_price: number | null;
  meta_title_fr: string | null;
  meta_title_ar: string | null;
  meta_description_fr: string | null;
  meta_description_ar: string | null;
  is_published: boolean;
  published_at: string | null;
  sort_order: number;
}

export interface VariantRow {
  id: string;
  product_id: string;
  color_id: string | null;
  size_id: string | null;
  sku: string;
  sku_is_custom: boolean;
  price_adjustment: number;
  product_media_id: string | null;
  barcode: string | null;
  stock_on_hand: number;
  is_active: boolean;
}

export interface ProductMediaRow {
  id: string;
  product_id: string;
  media_id: string;
  sort_order: number;
  is_featured: boolean;
}

/* ---------------------------------------------------------------------------
   Taxonomy — admin-created, never hardcoded (D-070, D-071, D-072)
   --------------------------------------------------------------------------- */

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<CategoryRow[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select(
          'id, parent_id, slug, name_fr, name_ar, description_fr, description_ar, media_id, sort_order, is_visible',
        )
        .order('sort_order')
        .order('name_fr');
      if (error) throw error;
      return data as CategoryRow[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useSizes() {
  return useQuery({
    queryKey: ['sizes'],
    queryFn: async (): Promise<SizeRow[]> => {
      const { data, error } = await supabase
        .from('sizes')
        .select('id, label_fr, label_ar, size_group, sort_order, is_active')
        // size_group first so numeric sizes never interleave with alpha ones,
        // then sort_order so XXL never lands before S (D-074).
        .order('size_group')
        .order('sort_order');
      if (error) throw error;
      return data as SizeRow[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useColors() {
  return useQuery({
    queryKey: ['colors'],
    queryFn: async (): Promise<ColorRow[]> => {
      const { data, error } = await supabase
        .from('colors')
        .select('id, name_fr, name_ar, hex_value, sort_order, is_active')
        .order('sort_order')
        .order('name_fr');
      if (error) throw error;
      return data as ColorRow[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** Generic create/update/delete for the three small taxonomy tables. */
export function useTaxonomyMutation(table: 'categories' | 'sizes' | 'colors') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (op: { action: 'insert' | 'update' | 'delete'; id?: string; row?: object }) => {
      if (op.action === 'insert') {
        const { error } = await supabase.from(table).insert(op.row!);
        if (error) throw error;
      } else if (op.action === 'update') {
        const { error } = await supabase.from(table).update(op.row!).eq('id', op.id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).delete().eq('id', op.id!);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
  });
}

/* ---------------------------------------------------------------------------
   Products
   --------------------------------------------------------------------------- */

export function useProducts(search = '') {
  return useQuery({
    queryKey: ['products', search],
    queryFn: async (): Promise<ProductRow[]> => {
      let q = supabase
        .from('products')
        .select(
          'id, slug, name_fr, name_ar, original_price, sale_price, is_published, published_at, sort_order',
        )
        .order('created_at', { ascending: false })
        .limit(200);
      if (search.trim()) q = q.ilike('name_fr', `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data as ProductRow[];
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['product', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const [product, media, variants, cats] = await Promise.all([
        supabase.from('products').select('*').eq('id', id!).single(),
        supabase
          .from('product_media')
          .select('id, product_id, media_id, sort_order, is_featured')
          .eq('product_id', id!)
          .order('sort_order'),
        supabase.from('product_variants').select('*').eq('product_id', id!),
        supabase.from('product_categories').select('category_id, is_primary').eq('product_id', id!),
      ]);
      if (product.error) throw product.error;
      return {
        product: product.data as ProductRow,
        media: (media.data ?? []) as ProductMediaRow[],
        variants: (variants.data ?? []) as VariantRow[],
        categories: (cats.data ?? []) as { category_id: string; is_primary: boolean }[],
      };
    },
  });
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id?: string; patch: Partial<ProductRow> }) => {
      if (id) {
        const { error } = await supabase.from('products').update(patch).eq('id', id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from('products').insert(patch).select('id').single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product', id] });
    },
  });
}

export function useSetProductCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, categoryIds }: { productId: string; categoryIds: string[] }) => {
      // Replace the whole set. The auto-primary trigger picks the first one,
      // and the partial unique index guarantees exactly one primary.
      const { error: delErr } = await supabase
        .from('product_categories')
        .delete()
        .eq('product_id', productId);
      if (delErr) throw delErr;
      if (!categoryIds.length) return;
      const { error } = await supabase
        .from('product_categories')
        .insert(categoryIds.map((cid, i) => ({ product_id: productId, category_id: cid, sort_order: i })));
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product', v.productId] }),
  });
}

/* ---------------------------------------------------------------------------
   Media attached to a product
   --------------------------------------------------------------------------- */

export function useAttachProductMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, mediaIds }: { productId: string; mediaIds: string[] }) => {
      const { data: existing } = await supabase
        .from('product_media')
        .select('sort_order')
        .eq('product_id', productId)
        .order('sort_order', { ascending: false })
        .limit(1);
      const start = ((existing?.[0] as { sort_order: number } | undefined)?.sort_order ?? -1) + 1;

      const { error } = await supabase.from('product_media').insert(
        mediaIds.map((mid, i) => ({ product_id: productId, media_id: mid, sort_order: start + i })),
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product', v.productId] }),
  });
}

export function useReorderProductMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids }: { productId: string; ids: string[] }) => {
      // Sequential rather than parallel: order matters and the list is short.
      for (let i = 0; i < ids.length; i++) {
        const { error } = await supabase
          .from('product_media')
          .update({ sort_order: i })
          .eq('id', ids[i]!);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product', v.productId] }),
  });
}

export function useSetFeaturedMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, mediaRowId }: { productId: string; mediaRowId: string }) => {
      // Clear first: the partial unique index allows only one featured row per
      // product, so setting the new one before clearing the old would fail.
      const { error: clearErr } = await supabase
        .from('product_media')
        .update({ is_featured: false })
        .eq('product_id', productId)
        .eq('is_featured', true);
      if (clearErr) throw clearErr;
      const { error } = await supabase
        .from('product_media')
        .update({ is_featured: true })
        .eq('id', mediaRowId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product', v.productId] }),
  });
}

export function useDetachProductMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { productId: string; id: string }) => {
      const { error } = await supabase.from('product_media').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product', v.productId] }),
  });
}

/* ---------------------------------------------------------------------------
   Variants
   --------------------------------------------------------------------------- */

export function useSaveVariants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId,
      create,
      remove,
    }: {
      productId: string;
      create: { color_id: string | null; size_id: string | null }[];
      remove: string[];
    }) => {
      if (remove.length) {
        // Refused by the database if the variant carries stock history it must
        // keep. Better to surface that than to silently drop the ledger.
        const { error } = await supabase.from('product_variants').delete().in('id', remove);
        if (error) throw error;
      }
      if (create.length) {
        const { error } = await supabase.from('product_variants').insert(
          create.map((c) => ({ product_id: productId, color_id: c.color_id, size_id: c.size_id })),
        );
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product', v.productId] }),
  });
}

export function useUpdateVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { productId: string; id: string; patch: Partial<VariantRow> }) => {
      const { error } = await supabase.from('product_variants').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product', v.productId] }),
  });
}

/**
 * Stock is adjusted through the LEDGER, never by writing stock_on_hand.
 *
 * `stock_on_hand` is a trigger-maintained cache; the movements table is the
 * source of truth (D-043). Writing the cache directly would desynchronise the
 * two and break stock_reconciliation().
 */
export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      variantId,
      delta,
      note,
    }: {
      productId: string;
      variantId: string;
      delta: number;
      note: string;
    }) => {
      if (delta === 0) return;
      const { error } = await supabase.from('stock_movements').insert({
        variant_id: variantId,
        movement_type: delta > 0 ? 'restock' : 'manual_correction',
        quantity_delta: delta,
        note,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product', v.productId] }),
  });
}
