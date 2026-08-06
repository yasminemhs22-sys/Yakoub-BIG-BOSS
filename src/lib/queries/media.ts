import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface MediaRow {
  id: string;
  storage_path: string;
  media_type: 'image' | 'video';
  mime_type: string;
  width: number | null;
  height: number | null;
  alt_fr: string | null;
  alt_ar: string | null;
  created_at: string;
}

const BUCKET = 'media';

/** Public URL for a stored file. */
export function mediaUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function useMediaLibrary() {
  return useQuery({
    queryKey: ['media'],
    queryFn: async (): Promise<MediaRow[]> => {
      const { data, error } = await supabase
        .from('media')
        .select('id, storage_path, media_type, mime_type, width, height, alt_fr, alt_ar, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as MediaRow[];
    },
  });
}

/**
 * Upload, then index.
 *
 * The file goes to Storage first; only on success is a row written to `media`.
 * The reverse order would leave rows pointing at files that do not exist.
 *
 * The filename is randomised: uploading "photo (1).jpg" twice must not
 * overwrite the first, and Arabic or spaced filenames break URLs.
 */
export function useUploadMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<MediaRow> => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: '31536000', upsert: false });
      if (upErr) throw upErr;

      const dims = await readImageSize(file).catch(() => null);

      const { data, error } = await supabase
        .from('media')
        .insert({
          storage_path: path,
          media_type: file.type.startsWith('video/') ? 'video' : 'image',
          mime_type: file.type,
          file_size: file.size,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
        })
        .select()
        .single();

      if (error) {
        // Do not leave an orphaned file behind if indexing failed.
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      return data as MediaRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: MediaRow) => {
      // Row first: the FK from product_media is ON DELETE RESTRICT, so a media
      // item still used by a product is refused here — before the file is
      // removed. Deleting the file first would strand live products.
      const { error } = await supabase.from('media').delete().eq('id', item.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([item.storage_path]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
  });
}

export function useUpdateMediaAlt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, alt_fr, alt_ar }: { id: string; alt_fr: string; alt_ar: string }) => {
      const { error } = await supabase.from('media').update({ alt_fr, alt_ar }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
  });
}

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('not an image'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}
