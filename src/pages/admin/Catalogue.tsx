import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProducts, useSaveProduct } from '@/lib/queries/catalogue';
import { useI18n } from '@/i18n';
import { useAdminText } from '@/auth/useAdminText';
import { SkeletonText } from '@/components/Skeleton';

/** Slug from a French name: lowercase, accents stripped, spaces to hyphens. */
function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function Catalogue() {
  const t = useAdminText();
  const { price, path } = useI18n();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useProducts(search);
  const save = useSaveProduct();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    const slug = slugify(name);
    if (!slug) {
      setError('Le nom doit contenir des lettres latines pour générer l’URL.');
      return;
    }
    try {
      // Price is 0 until the owner sets it; the product stays unpublished, and
      // publishing is blocked until it has images and variants anyway.
      await save.mutateAsync({ patch: { name_fr: name.trim(), slug, original_price: 0 } });
      setCreating(false);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  return (
    <main className="p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-display-sm">{t.shell.catalogue}</h1>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          + Produit
        </button>
      </div>

      <input
        className="field mt-6 max-w-sm"
        placeholder="Rechercher un produit"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <div className="mt-8">
          <SkeletonText lines={6} />
        </div>
      ) : !data?.length ? (
        <p className="mt-12 text-center text-muted">Aucun produit.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {data.map((p) => (
            <Link
              key={p.id}
              to={path(`/admin/catalogue/${p.id}`)}
              className="card flex flex-wrap items-center gap-3 p-4 transition-colors duration-base hover:border-metal/30"
            >
              <span className="font-medium">{p.name_fr}</span>
              {!p.name_ar?.trim() && (
                <span className="rounded bg-highlight/15 px-2 py-0.5 text-xs text-highlight">
                  AR manquant
                </span>
              )}
              {!p.is_published && (
                <span className="rounded bg-ink-raised px-2 py-0.5 text-xs text-muted">
                  Brouillon
                </span>
              )}
              <span className="ms-auto text-sm">
                {p.sale_price != null ? (
                  <>
                    <span className="text-muted line-through">{price(p.original_price)}</span>{' '}
                    <span className="text-neon">{price(p.sale_price)}</span>
                  </>
                ) : (
                  price(p.original_price)
                )}
              </span>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/80 p-4">
          <div className="card w-full max-w-md space-y-4 p-5">
            <h2 className="font-display text-xl">Nouveau produit</h2>
            <div>
              <label className="mb-1.5 block text-sm text-muted" htmlFor="new-name">
                Nom (français)
              </label>
              <input
                id="new-name"
                className="field"
                dir="ltr"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="T-shirt coton"
              />
              {name.trim() && (
                <p className="mt-1 font-mono text-xs text-muted" dir="ltr">
                  /{slugify(name)}
                </p>
              )}
            </div>
            {error && <p className="text-sm text-signal">{error}</p>}
            <div className="flex gap-2">
              <button type="button" className="btn-primary" onClick={create} disabled={save.isPending}>
                Créer
              </button>
              <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
