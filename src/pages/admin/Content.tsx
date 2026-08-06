import { useState } from 'react';
import { usePages, useUpdatePage, translationGaps, type PageRow } from '@/lib/queries/pages';
import { useAdminText } from '@/auth/useAdminText';
import { SkeletonText } from '@/components/Skeleton';
import { BilingualField } from '@/components/admin/BilingualField';

/**
 * Pages and their SEO metadata.
 *
 * Legal pages were created empty in the Phase 1 seed and are unpublished until
 * the owner writes them (§13.6). Nothing ships with placeholder text (D-138).
 *
 * The per-page block editor lands with the storefront in Phase 6, when there
 * is something to preview it against.
 */
export default function Content() {
  const t = useAdminText();
  const { data, isLoading } = usePages();
  const update = useUpdatePage();
  const [editing, setEditing] = useState<PageRow | null>(null);
  const [draft, setDraft] = useState<Partial<PageRow>>({});

  function open(page: PageRow) {
    setEditing(page);
    setDraft(page);
  }

  async function save() {
    if (!editing) return;
    await update.mutateAsync({
      id: editing.id,
      patch: {
        title_fr: draft.title_fr ?? '',
        title_ar: draft.title_ar ?? '',
        meta_title_fr: draft.meta_title_fr ?? '',
        meta_title_ar: draft.meta_title_ar ?? '',
        meta_description_fr: draft.meta_description_fr ?? '',
        meta_description_ar: draft.meta_description_ar ?? '',
        is_published: draft.is_published ?? false,
      },
    });
    setEditing(null);
  }

  if (isLoading) {
    return (
      <main className="p-4 lg:p-8">
        <SkeletonText lines={6} />
      </main>
    );
  }

  return (
    <main className="p-4 lg:p-8">
      <h1 className="font-display text-display-sm">{t.shell.content}</h1>

      <div className="mt-8 space-y-3">
        {data?.map((page) => {
          const gaps = translationGaps(page);
          return (
            <button
              key={page.id}
              type="button"
              onClick={() => open(page)}
              className="card flex w-full flex-wrap items-center gap-3 p-4 text-start transition-colors duration-base hover:border-metal/30"
            >
              <span className="font-medium">{page.title_fr}</span>
              <span className="font-mono text-xs text-muted" dir="ltr">
                /{page.slug}
              </span>

              {!page.is_published && (
                <span className="rounded bg-ink-raised px-2 py-0.5 text-xs text-muted">
                  Brouillon
                </span>
              )}
              {gaps.length > 0 && (
                <span className="rounded bg-highlight/15 px-2 py-0.5 text-xs text-highlight">
                  {gaps.length} traduction(s) manquante(s)
                </span>
              )}
              {page.is_system && (
                <span className="ms-auto text-xs text-muted/60">système</span>
              )}
            </button>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-20 flex items-start justify-center overflow-auto bg-black/80 p-4">
          <div className="card my-8 w-full max-w-2xl space-y-5 p-5">
            <h2 className="font-display text-xl">
              {editing.title_fr}{' '}
              <span className="font-mono text-sm text-muted" dir="ltr">
                /{editing.slug}
              </span>
            </h2>

            <BilingualField
              label="Titre de la page"
              valueFr={draft.title_fr ?? ''}
              valueAr={draft.title_ar ?? ''}
              onChangeFr={(v) => setDraft({ ...draft, title_fr: v })}
              onChangeAr={(v) => setDraft({ ...draft, title_ar: v })}
            />

            <BilingualField
              label="Titre SEO (affiché dans Google)"
              valueFr={draft.meta_title_fr ?? ''}
              valueAr={draft.meta_title_ar ?? ''}
              onChangeFr={(v) => setDraft({ ...draft, meta_title_fr: v })}
              onChangeAr={(v) => setDraft({ ...draft, meta_title_ar: v })}
            />

            <BilingualField
              label="Description SEO"
              valueFr={draft.meta_description_fr ?? ''}
              valueAr={draft.meta_description_ar ?? ''}
              onChangeFr={(v) => setDraft({ ...draft, meta_description_fr: v })}
              onChangeAr={(v) => setDraft({ ...draft, meta_description_ar: v })}
              multiline
            />

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.is_published ?? false}
                onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })}
              />
              Publiée (visible par les clients)
            </label>

            <div className="flex gap-2">
              <button type="button" className="btn-primary" onClick={save}>
                Enregistrer
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
