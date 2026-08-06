import { useMediaLibrary } from '@/lib/queries/media';
import { useSettings } from '@/lib/queries/settings';
import { imageUrl } from '@/lib/image';

/**
 * The brand mark.
 *
 * Reads its image from `branding.logo_media_id` in settings, so replacing the
 * logo is an upload and a dropdown — never a deployment (D-110). Falls back to
 * the wordmark when no logo is set, which keeps a fresh install looking
 * deliberate rather than broken.
 *
 * The alt text is the shop name, not "logo": a screen reader announcing "logo"
 * tells the listener nothing.
 */
export function Brand({
  className = '',
  height = 40,
  showWordmark = false,
}: {
  className?: string;
  /** Rendered height in px. The source is square, so width follows. */
  height?: number;
  /** Keep the text alongside the mark — useful in the footer. */
  showWordmark?: boolean;
}) {
  const { data: settings } = useSettings();
  const { data: media } = useMediaLibrary();

  const logoId = settings?.['branding.logo_media_id'] as string | undefined;
  const name = (settings?.['business.name'] as string) ?? 'YAKOUB BIG BOSS';
  const path = logoId ? media?.find((m) => m.id === logoId)?.storage_path : null;

  if (!path) {
    return (
      <span className={`font-display tracking-tight ${className}`}>{name}</span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <img
        src={imageUrl(path, { width: height * 2, resize: 'contain' })}
        alt={name}
        // Explicit dimensions so the header does not jump while the logo loads.
        width={height}
        height={height}
        style={{ height, width: height }}
        className="shrink-0 object-contain"
      />
      {showWordmark && (
        <span className="font-display tracking-tight">{name}</span>
      )}
    </span>
  );
}
