import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/i18n';
import { useAdminText } from '@/auth/useAdminText';
import { useSetting } from '@/lib/queries/settings';
import { SkeletonText } from '@/components/Skeleton';

/**
 * Stock overview.
 *
 * Answers one question the owner asks daily: what am I about to run out of?
 * Editing happens on the product page, where the context is; this is the alert
 * list, not a second editor.
 */
function useStockLevels(threshold: number) {
  return useQuery({
    queryKey: ['stock-levels', threshold],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_variants')
        .select(
          `id, sku, stock_on_hand,
           products!inner ( id, name_fr, name_ar, is_published ),
           colors ( name_fr ), sizes ( label_fr )`,
        )
        .eq('is_active', true)
        .lte('stock_on_hand', threshold)
        .order('stock_on_hand');
      if (error) throw error;
      return data as unknown as {
        id: string;
        sku: string;
        stock_on_hand: number;
        products: { id: string; name_fr: string; name_ar: string | null; is_published: boolean };
        colors: { name_fr: string } | null;
        sizes: { label_fr: string } | null;
      }[];
    },
  });
}

export default function Inventory() {
  const { locale, pick, path } = useI18n();
  const t = useAdminText();
  const threshold = useSetting<number>('inventory.low_stock_threshold', 5);
  const { data, isLoading } = useStockLevels(threshold);

  const out = (data ?? []).filter((v) => v.stock_on_hand <= 0);
  const low = (data ?? []).filter((v) => v.stock_on_hand > 0);

  return (
    <main className="p-4 lg:p-8">
      <h1 className="font-display text-display-sm">{t.shell.inventory}</h1>
      <p className="mt-2 text-sm text-muted">
        {locale === 'ar'
          ? `تُعرض المتغيّرات التي مخزونها ${threshold} أو أقل. التعديل يتم من صفحة المنتج.`
          : `Variantes à ${threshold} unités ou moins. La modification se fait sur la fiche produit.`}
      </p>

      {isLoading ? (
        <div className="mt-8">
          <SkeletonText lines={6} />
        </div>
      ) : !data?.length ? (
        <div className="mt-8 rounded-control bg-success/10 p-5">
          <p className="text-success">
            {locale === 'ar' ? 'لا يوجد مخزون منخفض.' : 'Aucun stock faible.'}
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {out.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm text-signal">
                {locale === 'ar' ? 'نفد المخزون' : 'Rupture'} ({out.length})
              </h2>
              <StockList rows={out} pick={pick} path={path} />
            </section>
          )}
          {low.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm text-highlight">
                {locale === 'ar' ? 'مخزون منخفض' : 'Stock faible'} ({low.length})
              </h2>
              <StockList rows={low} pick={pick} path={path} />
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function StockList({
  rows,
  pick,
  path,
}: {
  rows: {
    id: string;
    sku: string;
    stock_on_hand: number;
    products: { id: string; name_fr: string; name_ar: string | null; is_published: boolean };
    colors: { name_fr: string } | null;
    sizes: { label_fr: string } | null;
  }[];
  pick: (v: { fr?: string | null; ar?: string | null }) => string;
  path: (to: string) => string;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((v) => (
        <li key={v.id} className="card flex flex-wrap items-center gap-3 p-4">
          <Link to={path(`/admin/catalogue/${v.products.id}`)} className="hover:underline">
            {pick({ fr: v.products.name_fr, ar: v.products.name_ar })}
          </Link>
          <span className="text-sm text-muted">
            {[v.colors?.name_fr, v.sizes?.label_fr].filter(Boolean).join(' · ')}
          </span>
          <span className="font-mono text-xs text-muted" dir="ltr">
            {v.sku}
          </span>
          {!v.products.is_published && (
            <span className="rounded bg-ink-raised px-2 py-0.5 text-xs text-muted">brouillon</span>
          )}
          <span
            className={`ms-auto text-lg ${v.stock_on_hand <= 0 ? 'text-signal' : 'text-highlight'}`}
            dir="ltr"
          >
            {v.stock_on_hand}
          </span>
        </li>
      ))}
    </ul>
  );
}
