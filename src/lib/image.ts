import { supabase } from '@/lib/supabase';

/**
 * Image URLs with server-side transformation.
 *
 * Supabase Storage can resize and re-encode on the fly, so a 4MB phone photo is
 * never sent to a customer on 3G. Without this, product photography alone would
 * blow every performance budget in §18.
 *
 * WebP everywhere: supported by every browser this audience uses, and roughly
 * 30% smaller than JPEG at the same quality.
 */
const BUCKET = 'media';

export interface ImageOptions {
  width?: number;
  height?: number;
  quality?: number;
  resize?: 'cover' | 'contain' | 'fill';
}

export function imageUrl(path: string | null | undefined, options: ImageOptions = {}): string {
  if (!path) return '';
  const { width, height, quality = 75, resize = 'cover' } = options;

  if (!width && !height) {
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  return supabase.storage.from(BUCKET).getPublicUrl(path, {
    transform: { width, height, quality, resize },
  }).data.publicUrl;
}

/**
 * A srcset so the browser picks the smallest file that fits.
 *
 * A phone at 375px wide should never download the 1200px desktop image, which
 * is exactly what happens without this.
 */
export function imageSrcSet(
  path: string | null | undefined,
  widths: number[] = [320, 480, 640, 960, 1280],
  options: Omit<ImageOptions, 'width'> = {},
): string {
  if (!path) return '';
  return widths.map((w) => `${imageUrl(path, { ...options, width: w })} ${w}w`).join(', ');
}

/** Common `sizes` values, so the browser can choose before layout. */
export const SIZES = {
  productCard: '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw',
  productHero: '(min-width: 1024px) 50vw, 100vw',
  fullWidth: '100vw',
  thumbnail: '64px',
} as const;
