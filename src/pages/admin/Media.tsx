import { useRef, useState } from 'react';
import {
  mediaUrl,
  useDeleteMedia,
  useMediaLibrary,
  useUpdateMediaAlt,
  useUploadMedia,
  type MediaRow,
} from '@/lib/queries/media';
import { useAdminText } from '@/auth/useAdminText';
import { Skeleton } from '@/components/Skeleton';
import { BilingualField } from '@/components/admin/BilingualField';

/**
 * Media library with reuse (§12.4).
 *
 * One upload, used in many places: a category image, a hero, three products.
 * Re-uploading the same photo each time wastes the owner's data allowance and
 * fills storage with duplicates.
 */
export default function Media() {
  const t = useAdminText();
  const { data, isLoading } = useMediaLibrary();
  const upload = useUploadMedia();
  const remove = useDeleteMedia();
  const updateAlt = useUpdateMediaAlt();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<MediaRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [altFr, setAltFr] = useState('');
  const [altAr, setAltAr] = useState('');

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const file of Array.from(files)) {
      try {
        await upload.mutateAsync(file);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      }
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  function openItem(item: MediaRow) {
    setSelected(item);
    setAltFr(item.alt_fr ?? '');
    setAltAr(item.alt_ar ?? '');
  }

  async function onDelete(item: MediaRow) {
    setError(null);
    try {
      await remove.mutateAsync(item);
      setSelected(null);
    } catch {
      // ON DELETE RESTRICT from product_media refuses this when the image is
      // still used, which is the correct outcome — explain rather than fail
      // silently.
      setError('Cette image est utilisée par un produit. Retirez-la du produit d’abord.');
    }
  }

  return (
    <main className="p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-display-sm">{t.shell.content}</h1>
        <button type="button" className="btn-primary" onClick={() => fileInput.current?.click()}>
          {upload.isPending ? '…' : '+ Upload'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/mp4"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-control bg-signal/10 p-3 text-sm text-signal">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : !data?.length ? (
        <p className="mt-12 text-center text-muted">Aucune image. Commencez par en ajouter une.</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {data.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openItem(item)}
              className="group relative aspect-square overflow-hidden rounded-card border border-ink-raised"
            >
              {item.media_type === 'video' ? (
                <div className="flex h-full items-center justify-center bg-ink-raised text-muted">
                  ▶
                </div>
              ) : (
                <img
                  src={mediaUrl(item.storage_path)}
                  alt={item.alt_fr ?? ''}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-base group-hover:scale-105"
                />
              )}
              {!item.alt_fr && (
                <span className="absolute bottom-1 end-1 rounded bg-highlight/90 px-1 text-[10px] text-ink">
                  alt
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/80 p-4">
          <div className="card max-h-[90dvh] w-full max-w-lg overflow-auto p-5">
            <img
              src={mediaUrl(selected.storage_path)}
              alt=""
              className="mb-4 max-h-64 w-full rounded-control object-contain"
            />
            <p className="mb-2 text-xs text-muted" dir="ltr">
              {selected.width}×{selected.height} · {selected.mime_type}
            </p>

            {/* The id is needed when wiring an image to a setting by hand.
                Selectable and copyable rather than hidden. */}
            <div className="mb-4 flex items-center gap-2">
              <code className="select-all rounded bg-ink-raised px-2 py-1 text-xs text-metal" dir="ltr">
                {selected.id}
              </code>
              <button
                type="button"
                className="text-xs text-muted hover:text-white"
                onClick={() => navigator.clipboard?.writeText(selected.id)}
              >
                copier
              </button>
            </div>

            <BilingualField
              label="Texte alternatif (accessibilité et SEO)"
              valueFr={altFr}
              valueAr={altAr}
              onChangeFr={setAltFr}
              onChangeAr={setAltAr}
            />

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  await updateAlt.mutateAsync({ id: selected.id, alt_fr: altFr, alt_ar: altAr });
                  setSelected(null);
                }}
              >
                {t.shell.settings ? 'Enregistrer' : 'Save'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
                Fermer
              </button>
              <button
                type="button"
                className="ms-auto text-sm text-signal hover:underline"
                onClick={() => onDelete(selected)}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
