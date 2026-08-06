import { useMemo, useState } from 'react';
import type { ColorRow, SizeRow, VariantRow } from '@/lib/queries/catalogue';

/**
 * Colour × size grid (D-118).
 *
 * A product with 5 colours and 6 sizes is 30 variants. One form per variant
 * would mean 30 screens; this is one screen with 30 checkboxes. That is the
 * difference between a catalogue the owner keeps up to date and one they
 * abandon.
 *
 * Nullable colour and size are first-class here, not an edge case: a One Size
 * product simply has no size column, a single-colour product no colour row
 * (D-075).
 */
export function VariantMatrix({
  colors,
  sizes,
  variants,
  selectedColorIds,
  selectedSizeIds,
  onApply,
  busy,
}: {
  colors: ColorRow[];
  sizes: SizeRow[];
  variants: VariantRow[];
  selectedColorIds: string[];
  selectedSizeIds: string[];
  onApply: (
    create: { color_id: string | null; size_id: string | null }[],
    remove: string[],
  ) => void;
  busy?: boolean;
}) {
  const activeColors = colors.filter((c) => selectedColorIds.includes(c.id));
  const activeSizes = sizes.filter((s) => selectedSizeIds.includes(s.id));

  // A product may legitimately have neither axis: one plain variant.
  const rows = activeColors.length ? activeColors : [null];
  const cols = activeSizes.length ? activeSizes : [null];

  const existing = useMemo(() => {
    const map = new Map<string, VariantRow>();
    for (const v of variants) map.set(`${v.color_id ?? '-'}|${v.size_id ?? '-'}`, v);
    return map;
  }, [variants]);

  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(variants.map((v) => `${v.color_id ?? '-'}|${v.size_id ?? '-'}`)),
  );

  function toggle(key: string) {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChecked(next);
  }

  function apply() {
    const create: { color_id: string | null; size_id: string | null }[] = [];
    const remove: string[] = [];

    for (const c of rows) {
      for (const s of cols) {
        const key = `${c?.id ?? '-'}|${s?.id ?? '-'}`;
        const isOn = checked.has(key);
        const row = existing.get(key);
        if (isOn && !row) create.push({ color_id: c?.id ?? null, size_id: s?.id ?? null });
        if (!isOn && row) remove.push(row.id);
      }
    }
    onApply(create, remove);
  }

  const dirty =
    checked.size !== variants.length ||
    variants.some((v) => !checked.has(`${v.color_id ?? '-'}|${v.size_id ?? '-'}`));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2 text-start text-muted">Couleur / Taille</th>
              {cols.map((s) => (
                <th key={s?.id ?? 'none'} className="p-2 text-center text-muted">
                  {s ? s.label_fr : 'Unique'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c?.id ?? 'none'} className="border-t border-ink-raised">
                <td className="p-2">
                  <span className="flex items-center gap-2">
                    {c && (
                      <span
                        className="inline-block h-4 w-4 rounded-full border border-ink-raised"
                        style={{ backgroundColor: c.hex_value }}
                      />
                    )}
                    {c ? c.name_fr : 'Sans couleur'}
                  </span>
                </td>
                {cols.map((s) => {
                  const key = `${c?.id ?? '-'}|${s?.id ?? '-'}`;
                  const row = existing.get(key);
                  return (
                    <td key={key} className="p-2 text-center">
                      <label className="inline-flex flex-col items-center gap-1">
                        <input
                          type="checkbox"
                          checked={checked.has(key)}
                          onChange={() => toggle(key)}
                        />
                        {row && (
                          <span
                            className={`text-[10px] ${row.stock_on_hand > 0 ? 'text-muted' : 'text-signal'}`}
                          >
                            {row.stock_on_hand}
                          </span>
                        )}
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dirty && (
        <div className="flex items-center gap-3">
          <button type="button" className="btn-primary" onClick={apply} disabled={busy}>
            Appliquer les variantes
          </button>
          <p className="text-xs text-muted">
            Décocher une variante la supprime. Refusé si elle possède un historique de stock.
          </p>
        </div>
      )}
    </div>
  );
}
