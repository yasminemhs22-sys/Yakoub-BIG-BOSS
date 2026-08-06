import { useState } from 'react';
import {
  useCategories,
  useColors,
  useSizes,
  useTaxonomyMutation,
} from '@/lib/queries/catalogue';

/**
 * Categories, sizes and colours — all admin-created (D-070, D-071, D-072).
 *
 * Nothing here ships with a default list. A shop selling shoes creates 38-45;
 * one selling t-shirts creates S-XXL; one selling caps creates a single
 * "Taille unique". The platform stays generic (D-214).
 */
function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function Taxonomy() {
  const [tab, setTab] = useState<'categories' | 'sizes' | 'colors'>('categories');

  return (
    <main className="p-4 lg:p-8">
      <h1 className="font-display text-display-sm">Catégories, tailles et couleurs</h1>

      <div className="mt-6 flex gap-2">
        {(['categories', 'sizes', 'colors'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-control px-4 py-2 text-sm ${
              tab === k ? 'bg-neon text-ink' : 'bg-ink-surface text-muted'
            }`}
          >
            {k === 'categories' ? 'Catégories' : k === 'sizes' ? 'Tailles' : 'Couleurs'}
          </button>
        ))}
      </div>

      <div className="mt-6 max-w-2xl">
        {tab === 'categories' && <CategoriesPanel />}
        {tab === 'sizes' && <SizesPanel />}
        {tab === 'colors' && <ColorsPanel />}
      </div>
    </main>
  );
}

function CategoriesPanel() {
  const { data } = useCategories();
  const mutate = useTaxonomyMutation('categories');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="field"
          placeholder="Nom de la catégorie (français)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="button"
          className="btn-primary shrink-0"
          onClick={async () => {
            setError(null);
            const slug = slugify(name);
            if (!slug) return setError('Nom invalide');
            try {
              await mutate.mutateAsync({
                action: 'insert',
                row: { name_fr: name.trim(), slug },
              });
              setName('');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Erreur');
            }
          }}
        >
          Ajouter
        </button>
      </div>
      {error && <p className="text-sm text-signal">{error}</p>}

      <ul className="space-y-2">
        {data?.map((c) => (
          <li key={c.id} className="card flex items-center gap-3 p-3">
            <span>{c.name_fr}</span>
            {!c.name_ar?.trim() && (
              <span className="rounded bg-highlight/15 px-2 py-0.5 text-xs text-highlight">
                AR manquant
              </span>
            )}
            <span className="ms-auto font-mono text-xs text-muted" dir="ltr">
              /{c.slug}
            </span>
            <button
              type="button"
              className="text-sm text-signal hover:underline"
              onClick={async () => {
                setError(null);
                try {
                  await mutate.mutateAsync({ action: 'delete', id: c.id });
                } catch {
                  setError('Catégorie utilisée par des produits — retirez-la d’abord.');
                }
              }}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SizesPanel() {
  const { data } = useSizes();
  const mutate = useTaxonomyMutation('sizes');
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState<'alpha' | 'numeric' | 'one_size' | 'custom'>('alpha');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className="field flex-1"
          placeholder="Taille (ex : M, 42, Unique)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          dir="ltr"
        />
        <select
          className="field w-40"
          value={group}
          onChange={(e) => setGroup(e.target.value as typeof group)}
        >
          <option value="alpha">Lettres</option>
          <option value="numeric">Chiffres</option>
          <option value="one_size">Unique</option>
          <option value="custom">Autre</option>
        </select>
        <button
          type="button"
          className="btn-primary shrink-0"
          onClick={async () => {
            if (!label.trim()) return;
            await mutate.mutateAsync({
              action: 'insert',
              row: {
                label_fr: label.trim(),
                size_group: group,
                sort_order: (data?.length ?? 0) * 10,
              },
            });
            setLabel('');
          }}
        >
          Ajouter
        </button>
      </div>

      <ul className="space-y-2">
        {data?.map((s) => (
          <li key={s.id} className="card flex items-center gap-3 p-3">
            <span dir="ltr">{s.label_fr}</span>
            <span className="text-xs text-muted">{s.size_group}</span>
            <button
              type="button"
              className="ms-auto text-sm text-signal hover:underline"
              onClick={() => mutate.mutate({ action: 'delete', id: s.id })}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ColorsPanel() {
  const { data } = useColors();
  const mutate = useTaxonomyMutation('colors');
  const [name, setName] = useState('');
  const [hex, setHex] = useState('#000000');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className="field flex-1"
          placeholder="Nom de la couleur (français)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="color"
          className="h-12 w-16 rounded-control border border-ink-raised bg-ink-surface"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          aria-label="Couleur"
        />
        <button
          type="button"
          className="btn-primary shrink-0"
          onClick={async () => {
            if (!name.trim()) return;
            await mutate.mutateAsync({
              action: 'insert',
              row: { name_fr: name.trim(), hex_value: hex },
            });
            setName('');
          }}
        >
          Ajouter
        </button>
      </div>

      <ul className="space-y-2">
        {data?.map((c) => (
          <li key={c.id} className="card flex items-center gap-3 p-3">
            <span
              className="h-6 w-6 rounded-full border border-ink-raised"
              style={{ backgroundColor: c.hex_value }}
            />
            <span>{c.name_fr}</span>
            <span className="font-mono text-xs text-muted" dir="ltr">
              {c.hex_value}
            </span>
            <button
              type="button"
              className="ms-auto text-sm text-signal hover:underline"
              onClick={() => mutate.mutate({ action: 'delete', id: c.id })}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
