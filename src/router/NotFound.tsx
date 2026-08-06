import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';

/**
 * A 404 is a moment for direction, not decoration. Say what happened and give
 * the one action that helps.
 */
export function NotFound() {
  const { t, path } = useI18n();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-display text-display-lg text-neon">404</p>
      <h1 className="text-xl text-white">{t.errors.notFound}</h1>
      <Link to={path('/')} className="btn-secondary">
        {t.errors.notFoundAction}
      </Link>
    </main>
  );
}
