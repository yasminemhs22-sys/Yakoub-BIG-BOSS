import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useAdminText } from '@/auth/useAdminText';
import { useI18n } from '@/i18n';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { Brand } from '@/components/Brand';

export default function AdminLogin() {
  const { signIn, isAdmin, loading, session, profile } = useAuth();
  const t = useAdminText();
  const { path } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isAdmin) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? path('/admin')} replace />;
  }

  /**
   * Authenticated but not staff.
   *
   * A real case: someone could hold a valid auth token with no admin_users row,
   * or a former employee's row could be deactivated while their session lives
   * on. Saying so plainly beats an infinite redirect loop.
   */
  const authenticatedButNotStaff = !loading && session && !profile;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const { error: signInError } = await signIn(email, password);
    setBusy(false);
    if (signInError) {
      setError(t.signIn.invalid);
      return;
    }
    navigate((location.state as { from?: string } | null)?.from ?? path('/admin'), {
      replace: true,
    });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-between">
          <Brand height={48} />
          <LanguageSwitch />
        </div>

        <h1 className="font-display text-display-sm">{t.signIn.title}</h1>
        <p className="mt-2 text-sm text-muted">{t.signIn.subtitle}</p>

        {authenticatedButNotStaff && (
          <p role="alert" className="mt-6 rounded-control bg-signal/10 p-3 text-sm text-signal">
            {t.signIn.notStaff}
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-muted">
              {t.signIn.email}
            </label>
            <input
              id="email"
              type="email"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              dir="ltr"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm text-muted">
              {t.signIn.password}
            </label>
            <input
              id="password"
              type="password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              dir="ltr"
              required
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-signal">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? t.signIn.submitting : t.signIn.submit}
          </button>
        </form>

        <Link to={path('/')} className="mt-6 inline-block text-sm text-muted hover:text-white">
          {t.signIn.backToShop}
        </Link>
      </div>
    </main>
  );
}
