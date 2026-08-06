import { useI18n } from '@/i18n';

/**
 * Side-by-side French and Arabic inputs.
 *
 * The Product Owner writes all content through this dashboard (D-102), so
 * entry speed is a design requirement, not a nicety. Showing both languages at
 * once removes the tab-switching that makes bilingual entry tedious enough to
 * be skipped — which is how an Arabic site ends up half empty.
 *
 * The missing-translation badge is the loud half of D-095: silent for the
 * customer, unmissable here.
 */
export function BilingualField({
  label,
  valueFr,
  valueAr,
  onChangeFr,
  onChangeAr,
  multiline = false,
  placeholder,
}: {
  label: string;
  valueFr: string;
  valueAr: string;
  onChangeFr: (v: string) => void;
  onChangeAr: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { locale } = useI18n();
  const missingAr = valueFr.trim().length > 0 && valueAr.trim().length === 0;

  const Input = multiline ? 'textarea' : 'input';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted">{label}</label>
        {missingAr && (
          <span className="rounded bg-highlight/15 px-2 py-0.5 text-xs text-highlight">
            {locale === 'ar' ? 'الترجمة العربية ناقصة' : 'Traduction arabe manquante'}
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <span className="mb-1 block text-xs text-muted/70">Français</span>
          <Input
            className="field"
            dir="ltr"
            rows={multiline ? 4 : undefined}
            value={valueFr}
            placeholder={placeholder}
            onChange={(e) => onChangeFr(e.target.value)}
          />
        </div>
        <div>
          <span className="mb-1 block text-xs text-muted/70">العربية</span>
          <Input
            className="field"
            dir="rtl"
            rows={multiline ? 4 : undefined}
            value={valueAr}
            placeholder={placeholder}
            onChange={(e) => onChangeAr(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
