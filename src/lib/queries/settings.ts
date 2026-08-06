import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
  is_public: boolean;
}

/**
 * Store settings.
 *
 * Only rows flagged `is_public` are readable with the anon key, so the
 * storefront receives business info and thresholds it needs, and nothing else.
 * The dashboard, authenticated, sees everything.
 */
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value, description, is_public');
      if (error) throw error;
      return Object.fromEntries((data as SettingRow[]).map((r) => [r.key, r.value]));
    },
    // Business info changes rarely; no reason to refetch it constantly.
    staleTime: 10 * 60 * 1000,
  });
}

export function useSetting<T>(key: string, fallback: T): T {
  const { data } = useSettings();
  const value = data?.[key];
  return (value === undefined || value === null ? fallback : value) as T;
}

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const { error } = await supabase.from('settings').update({ value }).eq('key', key);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}
