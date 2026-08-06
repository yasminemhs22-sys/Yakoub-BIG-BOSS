import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  useAdjustStock,
  useAttachProductMedia,
  useCategories,
  useColors,
  useDetachProductMedia,
  useProduct,
  useReorderProductMedia,
  useSaveProduct,
  useSaveVariants,
  useSetFeaturedMedia,
  useSetProductCategories,
  useSizes,
  type ProductRow,
} from '@/lib/queries/catalogue';
import { BilingualField } from '@/components/admin/BilingualField';
import { VariantMatrix } from '@/components/admin/VariantMatrix';
import { MediaPicker } from '@/components/admin/MediaPicker';
import { ProductMediaList } from '@/components/admin/ProductMediaList';
import { SkeletonText } from '@/components/Skeleton';

export default function ProductEditor() {
  const { id } = useParams();
  const { data, isLoading } = useProduct(id);
  const { data: categories } = useCategories();
  const { data: colors } = useColors();
  const { data: sizes } = useSizes();

  const save = useSaveProduct();
  const setCats = useSetProductCategories();
  const attach = useAttachProductMedia();
  const reorder = useReorderProductMedia();
  const setFeatured = useSetFeaturedMedia();
  const detach = useDetachProductMedia();
  const saveVariants = useSaveVariants();
  const adjust = useAdjustStock();

  const [draft, setDraft] = useState<Partial<ProductRow>>({});
  const [catIds, setCatIds] = useState<string[]>([]);
  const [colorIds, setColorIds] = useState<string[]>([]);
  const [sizeIds, setSizeIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDraft(data.product);
    setCatIds(data.categories.map((c) => c.category_id));
    // Pre-select the axes already in use, so the matrix opens showing reality.
    setColorIds([...new Set(data.variants.map((v) => v.color_id).filter(Boolean) as string[])]);
    setSizeIds([...new Set(data.variants.map((v) => v.size_id).filter(Boolean) as string[])]);
  }, [data]);

  if (isLoading || !data) {
    return (
      <main className="p-4 lg:p-8">
        <SkeletonText lines={10} />
      </main>
    );
  }

  async function saveProduct() {
    setError(null);
    try {
      await save.mutateAsync({
        id: id!,
        patch: {
          name_fr: draft.name_fr ?? '',
          name_ar: draft.name_ar ?? '',
          description_fr: draft.description_fr ?? '',
          description_ar: draft.description_ar ?? '',
          size_guide_fr: draft.size_guide_fr ?? '',
          size_guide_ar: draft.size_guide_ar ?? '',
          care_info_fr: draft.care_info_fr ?? '',
          care_info_ar: draft.care_info_ar ?? '',
          original_price: Number(draft.original_price ?? 0),
          sale_price:
            draft.sale_price === null || draft.sale_price === undefined || `${draft.sale_price}` === ''
              ? null
              : Number(draft.sale_price),
          is_published: draft.is_published ?? false,
        },
      });
      await setCats.mutateAsync({ productId: id!, categoryIds: catIds });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      // The database rejects a sale price that is not lower than the original,
      // and refuses publishing without images or variants. Show the real reason.
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  return (
    <main className="space-y-8 p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-display-sm">{data.product.name_fr}</h1>
        <span className="font-mono text-xs text-muted" dir="ltr">
          /{data.product.slug}
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-control bg-signal/10 p-3 text-sm text-signal">
          {error}
        </p>
      )}

      <section className="card space-y-5 p-5">
        <BilingualField
          label="Nom du produit"
          valueFr={draft.name_fr ?? ''}
          valueAr={draft.name_ar ?? ''}
          onChangeFr={(v) => setDraft({ ...draft, name_fr: v })}
          onChangeAr={(v) => setDraft({ ...draft, name_ar: v })}
        />
        <BilingualField
          label="Description"
          valueFr={draft.description_fr ?? ''}
          valueAr={draft.description_ar ?? ''}
          onChangeFr={(v) => setDraft({ ...draft, description_fr: v })}
          onChangeAr={(v) => setDraft({ ...draft, description_ar: v })}
          multiline
        />
        <BilingualField
          label="Guide des tailles"
          valueFr={draft.size_guide_fr ?? ''}
          valueAr={draft.size_guide_ar ?? ''}
          onChangeFr={(v) => setDraft({ ...draft, size_guide_fr: v })}
          onChangeAr={(v) => setDraft({ ...draft, size_guide_ar: v })}
          multiline
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm text-muted">Prix (DZD)</label>
            <input
              className="field"
              type="number"
              min={0}
              dir="ltr"
              value={draft.original_price ?? 0}
              onChange={(e) => setDraft({ ...draft, original_price: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-muted">
              Prix promotionnel (facultatif)
            </label>
            <input
              className="field"
              type="number"
              min={0}
              dir="ltr"
              value={draft.sale_price ?? ''}
              placeholder="—"
              onChange={(e) =>
                setDraft({
                  ...draft,
                  sale_price: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
            <p className="mt-1 text-xs text-muted">Doit être inférieur au prix normal.</p>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm text-muted">Catégories</label>
          <div className="flex flex-wrap gap-2">
            {categories?.map((c) => {
              const on = catIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    setCatIds(on ? catIds.filter((x) => x !== c.id) : [...catIds, c.id])
                  }
                  className={`rounded-control border px-3 py-1.5 text-sm transition-colors duration-fast ${
                    on ? 'border-neon bg-neon/15 text-neon' : 'border-ink-raised text-muted'
                  }`}
                >
                  {c.name_fr}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            La première sélectionnée devient la catégorie principale (fil d’Ariane et URL).
          </p>
        </div>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={draft.is_published ?? false}
            onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })}
          />
          Publié (visible par les clients)
        </label>

        <button type="button" className="btn-primary" onClick={saveProduct} disabled={save.isPending}>
          {saved ? '✓ Enregistré' : 'Enregistrer'}
        </button>
      </section>

      <section className="card p-5">
        <ProductMediaList
          items={data.media}
          onAdd={() => setPicking(true)}
          onReorder={(ids) => reorder.mutate({ productId: id!, ids })}
          onSetFeatured={(rowId) => setFeatured.mutate({ productId: id!, mediaRowId: rowId })}
          onDetach={(rowId) => detach.mutate({ productId: id!, id: rowId })}
        />
      </section>

      <section className="card space-y-5 p-5">
        <h2 className="font-display text-lg">Variantes</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm text-muted">Couleurs de ce produit</label>
            <div className="flex flex-wrap gap-2">
              {colors?.map((c) => {
                const on = colorIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setColorIds(on ? colorIds.filter((x) => x !== c.id) : [...colorIds, c.id])
                    }
                    className={`flex items-center gap-2 rounded-control border px-3 py-1.5 text-sm ${
                      on ? 'border-neon text-white' : 'border-ink-raised text-muted'
                    }`}
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-ink-raised"
                      style={{ backgroundColor: c.hex_value }}
                    />
                    {c.name_fr}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-muted">Tailles de ce produit</label>
            <div className="flex flex-wrap gap-2">
              {sizes?.map((s) => {
                const on = sizeIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setSizeIds(on ? sizeIds.filter((x) => x !== s.id) : [...sizeIds, s.id])
                    }
                    className={`rounded-control border px-3 py-1.5 text-sm ${
                      on ? 'border-neon text-white' : 'border-ink-raised text-muted'
                    }`}
                  >
                    {s.label_fr}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <VariantMatrix
          colors={colors ?? []}
          sizes={sizes ?? []}
          variants={data.variants}
          selectedColorIds={colorIds}
          selectedSizeIds={sizeIds}
          busy={saveVariants.isPending}
          onApply={async (create, remove) => {
            setError(null);
            try {
              await saveVariants.mutateAsync({ productId: id!, create, remove });
            } catch (e) {
              setError(
                e instanceof Error
                  ? `${e.message} — une variante avec historique de stock ne peut pas être supprimée.`
                  : 'Erreur',
              );
            }
          }}
        />
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-display text-lg">Stock</h2>
        <p className="text-xs text-muted">
          Le stock se corrige par mouvement, jamais en écrivant une quantité : le registre
          reste la source de vérité.
        </p>
        {data.variants.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-3 border-t border-ink-raised pt-3">
            <span className="font-mono text-xs text-metal" dir="ltr">
              {v.sku}
            </span>
            <span className={v.stock_on_hand > 0 ? 'text-sm' : 'text-sm text-signal'}>
              {v.stock_on_hand}
            </span>
            <div className="ms-auto flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-sm"
                onClick={() =>
                  adjust.mutate({
                    productId: id!,
                    variantId: v.id,
                    delta: 1,
                    note: 'Réapprovisionnement manuel',
                  })
                }
              >
                +1
              </button>
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-sm"
                onClick={() =>
                  adjust.mutate({
                    productId: id!,
                    variantId: v.id,
                    delta: 10,
                    note: 'Réapprovisionnement manuel',
                  })
                }
              >
                +10
              </button>
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-sm"
                onClick={() =>
                  adjust.mutate({
                    productId: id!,
                    variantId: v.id,
                    delta: -1,
                    note: 'Correction manuelle',
                  })
                }
              >
                −1
              </button>
            </div>
          </div>
        ))}
      </section>

      {picking && (
        <MediaPicker
          excludeIds={data.media.map((m) => m.media_id)}
          onClose={() => setPicking(false)}
          onPick={(ids) => attach.mutate({ productId: id!, mediaIds: ids })}
        />
      )}
    </main>
  );
}
