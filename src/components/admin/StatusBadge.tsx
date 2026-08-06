import { useI18n } from '@/i18n';

/**
 * Status colours come from the database, not from a switch statement here.
 *
 * Statuses are data (D-050): adding one is a row, and its colour arrives with
 * it. Hardcoding a palette would mean a new status renders grey until someone
 * remembers to deploy.
 */
export function StatusBadge({
  status,
}: {
  status: { code: string; label_fr: string; label_ar: string; color_hex: string | null };
}) {
  const { locale } = useI18n();
  const color = status.color_hex ?? '#6B7280';
  return (
    <span
      className="rounded px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {locale === 'ar' ? status.label_ar : status.label_fr}
    </span>
  );
}
