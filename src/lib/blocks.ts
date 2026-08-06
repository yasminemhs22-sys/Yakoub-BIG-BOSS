import { z } from 'zod';

/**
 * Content blocks are TYPED and VALIDATED. Never raw HTML (D-133).
 *
 * A free-form HTML box would let an administrator break the layout with a
 * stray tag, and would open stored XSS on the brand's own site. Every block
 * below has a fixed shape, validated before it is written and again before it
 * is rendered.
 *
 * Adding a block type means: add a schema here, add a renderer, add an editor.
 * Three deliberate steps — not a text area.
 */

/** Every translatable field is a pair. Arabic falls back to French silently. */
const bilingual = z.object({
  fr: z.string().default(''),
  ar: z.string().default(''),
});

const link = z
  .object({
    type: z.enum(['page', 'category', 'url', 'none']).default('none'),
    value: z.string().default(''),
    label: bilingual.optional(),
  })
  .default({ type: 'none', value: '' });

export const blockSchemas = {
  announcement: z.object({
    text: bilingual,
    link,
    dismissible: z.boolean().default(true),
  }),

  hero: z.object({
    media_id: z.string().uuid().nullable().default(null),
    headline: bilingual,
    subheadline: bilingual,
    cta: link,
    /** Dark overlay strength. The storefront photo is a night shot; without an
     *  overlay, white text on it is unreadable. */
    overlay: z.number().min(0).max(90).default(55),
  }),

  category_strip: z.object({
    title: bilingual,
    category_ids: z.array(z.string().uuid()).default([]),
  }),

  product_carousel: z.object({
    title: bilingual,
    /** Manual curation — "Choix du Boss" (D-295). No collections table: the
     *  ids live here, and the storefront filters to published products, so a
     *  deleted product simply stops appearing. */
    product_ids: z.array(z.string().uuid()).default([]),
    source: z.enum(['manual', 'new_arrivals', 'on_sale']).default('manual'),
    limit: z.number().int().min(1).max(24).default(8),
  }),

  promo_banner: z.object({
    media_id: z.string().uuid().nullable().default(null),
    link,
  }),

  trust_strip: z.object({
    items: z
      .array(
        z.object({
          icon: z.enum(['delivery', 'cash', 'quality', 'whatsapp', 'return']),
          title: bilingual,
          text: bilingual,
        }),
      )
      .default([]),
  }),

  store_presence: z.object({
    media_id: z.string().uuid().nullable().default(null),
    title: bilingual,
    address: bilingual,
    map_url: z.string().default(''),
    show_phone: z.boolean().default(true),
    show_whatsapp: z.boolean().default(true),
  }),

  social_proof: z.object({
    title: bilingual,
    items: z
      .array(z.object({ media_id: z.string().uuid().nullable(), caption: bilingual }))
      .default([]),
  }),

  rich_text: z.object({
    title: bilingual,
    /**
     * Plain text with paragraph breaks — NOT html. Rendered through React, so
     * any markup a user types appears as literal characters rather than being
     * executed. This is the whole point of D-133.
     */
    body: bilingual,
  }),
} as const;

export type BlockType = keyof typeof blockSchemas;

export const BLOCK_TYPES = Object.keys(blockSchemas) as BlockType[];

export type BlockData<T extends BlockType> = z.infer<(typeof blockSchemas)[T]>;

export interface ContentBlock {
  id: string;
  page_id: string;
  block_type: BlockType;
  position: number;
  is_visible: boolean;
  data: unknown;
}

/**
 * Parses a block's stored data.
 *
 * Returns defaults rather than throwing when the shape is wrong: a block saved
 * before a schema changed must not take down the whole page. The dashboard is
 * where a malformed block should be surfaced, not the storefront.
 */
export function parseBlock<T extends BlockType>(type: T, data: unknown): BlockData<T> {
  const schema = blockSchemas[type];
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data as BlockData<T>;
  return schema.parse({}) as BlockData<T>;
}

export function isBlockValid<T extends BlockType>(type: T, data: unknown): boolean {
  return blockSchemas[type].safeParse(data ?? {}).success;
}

/** A new block of the given type, pre-filled with its defaults. */
export function emptyBlock<T extends BlockType>(type: T): BlockData<T> {
  return blockSchemas[type].parse({}) as BlockData<T>;
}
