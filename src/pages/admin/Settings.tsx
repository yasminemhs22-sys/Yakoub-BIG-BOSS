import { useEffect, useState } from 'react';
import { useSettings, useUpdateSetting } from '@/lib/queries/settings';
import { useAdminText } from '@/auth/useAdminText';
import { SkeletonText } from '@/components/Skeleton';

/**
 * Store settings.
 *
 * Business phone, address, opening hours, social handles — everything the
 * storefront displays about the shop, editable without a deploy (D-135, D-136).
 */
const EDITABLE: { key: string; label: string; dir?: 'ltr' | 'rtl'; type?: string }[] = [
  { key: 'business.name', label: 'Nom de la boutique', dir: 'ltr' },
  { key: 'business.phone', label: 'Téléphone', dir: 'ltr', type: 'tel' },
  { key: 'business.whatsapp', label: 'WhatsApp', dir: 'ltr', type: 'tel' },
  { key: 'business.email', label: 'E-mail', dir: 'ltr', type: 'email' },
  { key: 'business.address_fr', label: 'Adresse (FR)', dir: 'ltr' },
  { key: 'business.address_ar', label: 'العنوان (AR)', dir: 'rtl' },
  { key: 'business.map_url', label: 'Lien Google Maps', dir: 'ltr' },
  { key: 'social.instagram', label: 'Instagram', dir: 'ltr' },
  { key: 'social.tiktok', label: 'TikTok', dir: 'ltr' },
  { key: 'social.facebook', label: 'Facebook', dir: 'ltr' },
];

export default function Settings() {
  const t = useAdminText();
  const { data, isLoading } = useSettings();
  const update = useUpdateSetting();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const f of EDITABLE) {
      const v = data[f.key];
      next[f.key] = v === null || v === undefined ? '' : String(v);
    }
    setDraft(next);
  }, [data]);

  async function save(key: string) {
    const raw = draft[key] ?? '';
    // Empty means "not set yet", stored as JSON null rather than an empty
    // string, so the storefront can distinguish "no email" from "".
    await update.mutateAsync({ key, value: raw.trim() === '' ? null : raw.trim() });
    setSaved(key);
    setTimeout(() => setSaved(null), 2000);
  }

  if (isLoading) {
    return (
      <main className="p-4 lg:p-8">
        <SkeletonText lines={8} />
      </main>
    );
  }

  return (
    <main className="p-4 lg:p-8">
      <h1 className="font-display text-display-sm">{t.shell.settings}</h1>

      <div className="mt-8 max-w-2xl space-y-5">
        {EDITABLE.map((f) => (
          <div key={f.key} className="card p-4">
            <label className="mb-1.5 block text-sm text-muted" htmlFor={f.key}>
              {f.label}
            </label>
            <div className="flex gap-2">
              <input
                id={f.key}
                className="field"
                dir={f.dir ?? 'ltr'}
                type={f.type ?? 'text'}
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              />
              <button type="button" className="btn-secondary shrink-0" onClick={() => save(f.key)}>
                {saved === f.key ? '✓' : t.shell.settings ? 'OK' : 'OK'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
