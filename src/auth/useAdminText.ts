import { useI18n } from '@/i18n';
import { adminFr } from '@/i18n/locales/admin.fr';
import { adminAr } from '@/i18n/locales/admin.ar';

/** Dashboard strings for the active locale. */
export function useAdminText() {
  const { locale } = useI18n();
  return locale === 'ar' ? adminAr : adminFr;
}
