import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { BlockType, ContentBlock } from '@/lib/blocks';

export interface PageRow {
  id: string;
  slug: string;
  page_type: 'home' | 'standard' | 'legal' | 'contact';
  title_fr: string;
  title_ar: string | null;
  meta_title_fr: string | null;
  meta_title_ar: string | null;
  meta_description_fr: string | null;
  meta_description_ar: string | null;
  is_system: boolean;
  is_published: boolean;
}

export function usePages() {
  return useQuery({
    queryKey: ['pages'],
    queryFn: async (): Promise<PageRow[]> => {
      const { data, error } = await supabase
        .from('pages')
        .select(
          'id, slug, page_type, title_fr, title_ar, meta_title_fr, meta_title_ar, meta_description_fr, meta_description_ar, is_system, is_published',
        )
        .order('page_type')
        .order('slug');
      if (error) throw error;
      return data as PageRow[];
    },
  });
}

export function usePageBlocks(pageId: string | undefined) {
  return useQuery({
    queryKey: ['page-blocks', pageId],
    enabled: Boolean(pageId),
    queryFn: async (): Promise<ContentBlock[]> => {
      const { data, error } = await supabase
        .from('content_blocks')
        .select('id, page_id, block_type, position, is_visible, data')
        .eq('page_id', pageId!)
        .order('position');
      if (error) throw error;
      return data as ContentBlock[];
    },
  });
}

export function useUpdatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PageRow> }) => {
      const { error } = await supabase.from('pages').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pages'] }),
  });
}

export function useSaveBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (block: {
      id?: string;
      page_id: string;
      block_type: BlockType;
      position: number;
      is_visible: boolean;
      data: unknown;
    }) => {
      if (block.id) {
        const { error } = await supabase
          .from('content_blocks')
          .update({
            block_type: block.block_type,
            position: block.position,
            is_visible: block.is_visible,
            data: block.data,
          })
          .eq('id', block.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('content_blocks').insert({
          page_id: block.page_id,
          block_type: block.block_type,
          position: block.position,
          is_visible: block.is_visible,
          data: block.data,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['page-blocks', v.page_id] }),
  });
}

export function useDeleteBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; pageId: string }) => {
      const { error } = await supabase.from('content_blocks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['page-blocks', v.pageId] }),
  });
}

/**
 * Reorders blocks in one round trip.
 *
 * The (page_id, position) constraint is DEFERRABLE, so intermediate duplicate
 * positions inside the transaction are tolerated and only the final state is
 * checked. Without that, reordering would need a temporary shuffle.
 */
export function useReorderBlocks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pageId, ids }: { pageId: string; ids: string[] }) => {
      const { error } = await supabase.rpc('reorder_content_blocks', {
        p_page_id: pageId,
        p_ids: ids,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['page-blocks', v.pageId] }),
  });
}

/**
 * Translation completeness (D-095).
 *
 * Customers never see a gap — French fills in silently. The dashboard is where
 * it must be loud, otherwise the Arabic site quietly stays half-empty forever.
 */
export function translationGaps(page: PageRow): string[] {
  const gaps: string[] = [];
  if (!page.title_ar?.trim()) gaps.push('title_ar');
  if (!page.meta_title_ar?.trim()) gaps.push('meta_title_ar');
  if (!page.meta_description_ar?.trim()) gaps.push('meta_description_ar');
  return gaps;
}
