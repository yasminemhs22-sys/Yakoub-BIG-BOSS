import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/i18n';
import { useAuth } from '@/auth/AuthProvider';
import { useAdminText } from '@/auth/useAdminText';
import { SkeletonText } from '@/components/Skeleton';

/**
 * Administrator accounts and their roles.
 *
 * Accounts are created in Supabase Auth, not here — this project never handles
 * passwords itself, which is one fewer thing to get wrong. This screen assigns
 * the role, which is what actually decides what someone can see.
 *
 * The database refuses to remove the last active Super Admin, so a careless
 * edit here cannot lock everyone out.
 */
function useAdmins() {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_users')
        .select('id, full_name, email, is_active, last_seen_at, roles ( id, code, name_fr, name_ar )')
        .order('created_at');
      if (error) throw error;
      return data as unknown as {
        id: string;
        full_name: string;
        email: string;
        is_active: boolean;
        last_seen_at: string | null;
        roles: { id: string; code: string; name_fr: string; name_ar: string } | null;
      }[];
    },
  });
}

function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, code, name_fr, name_ar')
        .order('sort_order');
      if (error) throw error;
      return data as { id: string; code: string; name_fr: string; name_ar: string }[];
    },
  });
}

export default function Access() {
  const { locale, date } = useI18n();
  const t = useAdminText();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: admins, isLoading } = useAdmins();
  const { data: roles } = useRoles();

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: object }) => {
      const { error } = await supabase.from('admin_users').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <main className="p-4 lg:p-8">
      <h1 className="font-display text-display-sm">{t.shell.access}</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        {locale === 'ar'
          ? 'تُنشأ الحسابات في Supabase Auth، وتُسنَد الأدوار هنا. لا يمكن إزالة آخر مدير عام.'
          : 'Les comptes se créent dans Supabase Auth ; les rôles s’attribuent ici. Le dernier Super Admin ne peut pas être retiré.'}
      </p>

      {isLoading ? (
        <div className="mt-8">
          <SkeletonText lines={4} />
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {admins?.map((a) => (
            <li key={a.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{a.full_name}</span>
                <span className="text-sm text-muted" dir="ltr">
                  {a.email}
                </span>
                {a.id === profile?.id && (
                  <span className="rounded bg-neon/15 px-2 py-0.5 text-xs text-neon">
                    {locale === 'ar' ? 'أنت' : 'vous'}
                  </span>
                )}
                {a.last_seen_at && (
                  <span className="ms-auto text-xs text-muted">{date(a.last_seen_at)}</span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <select
                  className="field w-56"
                  value={a.roles?.id ?? ''}
                  onChange={(e) => update.mutate({ id: a.id, patch: { role_id: e.target.value } })}
                >
                  {roles?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {locale === 'ar' ? r.name_ar : r.name_fr}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={a.is_active}
                    onChange={(e) =>
                      update.mutate({ id: a.id, patch: { is_active: e.target.checked } })
                    }
                  />
                  {locale === 'ar' ? 'نشط' : 'Actif'}
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      {update.isError && (
        <p role="alert" className="mt-4 rounded-control bg-signal/10 p-3 text-sm text-signal">
          {locale === 'ar'
            ? 'رُفض التعديل — لا يمكن إزالة آخر مدير عام نشط.'
            : 'Modification refusée — le dernier Super Admin actif ne peut pas être retiré.'}
        </p>
      )}
    </main>
  );
}
