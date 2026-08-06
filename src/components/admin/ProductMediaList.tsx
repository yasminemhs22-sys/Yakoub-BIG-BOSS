import { useState } from 'react';
import { mediaUrl, useMediaLibrary } from '@/lib/queries/media';
import type { ProductMediaRow } from '@/lib/queries/catalogue';

/**
 * Ordered product images with a featured one (D-078, D-079, D-080).
 *
 * Reordering uses explicit up/down controls rather than HTML5 drag-and-drop.
 * Two reasons: drag-and-drop does not work on touch without a library, and the
 * owner will be doing this on a phone in the shop. Buttons are unglamorous and
 * they work everywhere, including for anyone using a keyboard.
 */
export function ProductMediaList({
  items,
  onReorder,
  onSetFeatured,
  onDetach,
  onAdd,
}: {
  items: ProductMediaRow[];
  onReorder: (ids: string[]) => void;
  onSetFeatured: (rowId: string) => void;
  onDetach: (rowId: string) => void;
  onAdd: () => void;
}) {
  const { data: library } = useMediaLibrary();
  const [order, setOrder] = useState<string[] | null>(null);

  const ids = order ?? items.map((i) => i.id);
  const byId = new Map(items.map((i) => [i.id, i]));
  const pathOf = (mediaId: string) =>
    library?.find((m) => m.id === mediaId)?.storage_path ?? '';

  function move(index: number, direction: -1 | 1) {
    const next = [...ids];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
  }

  const dirty = order !== null && order.join() !== items.map((i) => i.id).join();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-muted">Images ({items.length})</h3>
        <button type="button" className="btn-secondary" onClick={onAdd}>
          + Images
        </button>
      </div>

      {!items.length ? (
        <p className="rounded-control bg-ink-raised p-4 text-sm text-muted">
          Aucune image. Un produit sans image ne peut pas être publié.
        </p>
      ) : (
        <ul className="space-y-2">
          {ids.map((rowId, index) => {
            const row = byId.get(rowId);
            if (!row) return null;
            return (
              <li
                key={rowId}
                className="flex items-center gap-3 rounded-control border border-ink-raised p-2"
              >
                <img
                  src={mediaUrl(pathOf(row.media_id))}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded object-cover"
                />

                <div className="flex-1">
                  {row.is_featured ? (
                    <span className="rounded bg-neon/15 px-2 py-0.5 text-xs text-neon">
                      Image principale
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-muted hover:text-white"
                      onClick={() => onSetFeatured(rowId)}
                    >
                      Définir comme principale
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Monter"
                    className="rounded px-2 py-1 text-muted hover:text-white disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Descendre"
                    className="rounded px-2 py-1 text-muted hover:text-white disabled:opacity-30"
                    disabled={index === ids.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="Retirer"
                    className="rounded px-2 py-1 text-signal hover:underline"
                    onClick={() => onDetach(rowId)}
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dirty && (
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            onReorder(ids);
            setOrder(null);
          }}
        >
          Enregistrer l’ordre
        </button>
      )}
    </div>
  );
}
