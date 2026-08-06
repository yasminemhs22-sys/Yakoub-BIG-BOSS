import { useRef, useState } from 'react';
import { mediaUrl, useMediaLibrary, useUploadMedia } from '@/lib/queries/media';

/**
 * Picks images for a product — or uploads new ones on the spot.
 *
 * Two paths on purpose. Uploading here is what the owner reaches for when
 * photographing a new arrival; picking from the library is what avoids sending
 * the same photo twice when one image serves several products, which costs the
 * owner's own data allowance and fills storage with duplicates.
 *
 * Freshly uploaded images are pre-selected, so the common case — shoot, upload,
 * attach — is two taps rather than four.
 */
export function MediaPicker({
  onPick,
  onClose,
  excludeIds = [],
}: {
  onPick: (ids: string[]) => void;
  onClose: () => void;
  excludeIds?: string[];
}) {
  const { data, isLoading } = useMediaLibrary();
  const upload = useUploadMedia();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const available = (data ?? []).filter(
    (m) => m.media_type === 'image' && !excludeIds.includes(m.id),
  );

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const row = await upload.mutateAsync(file);
        uploaded.push(row.id);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : 'Échec du téléchargement. Vérifiez que le stockage est configuré.',
        );
      }
    }
    // Pre-select what was just uploaded: that is almost always what the owner
    // wants attached.
    setSelected((prev) => [...prev, ...uploaded]);
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4">
      <div className="card flex max-h-[85dvh] w-full max-w-3xl flex-col p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl">Images du produit</h2>
          <button
            type="button"
            className="btn-primary"
            disabled={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            {upload.isPending ? 'Téléchargement…' : '+ Télécharger depuis l’appareil'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>

        {error && (
          <p role="alert" className="mb-3 rounded-control bg-signal/10 p-3 text-sm text-signal">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <p className="text-muted">Chargement…</p>
          ) : !available.length ? (
            <p className="py-8 text-center text-muted">
              Aucune image encore. Utilisez le bouton ci-dessus pour en télécharger.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {available.map((m) => {
                const on = selected.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setSelected(on ? selected.filter((x) => x !== m.id) : [...selected, m.id])
                    }
                    className={`relative aspect-square overflow-hidden rounded-control border-2 transition-colors duration-fast ${
                      on ? 'border-neon' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={mediaUrl(m.storage_path)}
                      alt={m.alt_fr ?? ''}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    {on && (
                      <span className="absolute end-1 top-1 rounded bg-neon px-1.5 text-xs text-ink">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={!selected.length}
            onClick={() => {
              onPick(selected);
              onClose();
            }}
          >
            Ajouter ({selected.length})
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
