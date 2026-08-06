import { Link, useParams } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useSettings } from '@/lib/queries/settings';

/**
 * Confirmation.
 *
 * The reference is the one thing the customer must keep, so it is large,
 * selectable and screenshot-friendly (D-060). Tracking later needs it together
 * with their phone number.
 */
export default function OrderConfirmed() {
  const { reference } = useParams();
  const { t, path, pick } = useI18n();
  const { data: settings } = useSettings();

  const phone = (settings?.['business.phone'] as string) ?? '';
  const whatsapp = (settings?.['business.whatsapp'] as string) ?? phone;
  const waLink = whatsapp
    ? `https://wa.me/213${whatsapp.replace(/^0/, '').replace(/\D/g, '')}`
    : null;

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-5xl" aria-hidden="true">
        ✓
      </p>
      <h1 className="mt-4 font-display text-display-sm">
        {pick({ fr: 'Commande enregistrée', ar: 'تم تسجيل الطلب' })}
      </h1>
      <p className="mt-3 text-muted">{t.orderStatus.confirmationCall}</p>

      <div className="card mt-8 p-6">
        <p className="text-sm text-muted">{t.orderStatus.reference}</p>
        <p className="mt-2 select-all font-mono text-2xl text-neon" dir="ltr">
          {reference}
        </p>
        <p className="mt-3 text-xs text-muted">
          {pick({
            fr: 'Gardez ce numéro — il vous permet de suivre votre commande.',
            ar: 'احتفظ بهذا الرقم — تتبع طلبك به.',
          })}
        </p>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to={path('/track')} className="btn-secondary">
          {t.orderStatus.trackTitle}
        </Link>
        {waLink && (
          <a href={waLink} target="_blank" rel="noreferrer" className="btn-secondary">
            WhatsApp
          </a>
        )}
        <Link to={path('/')} className="btn-secondary">
          {t.cart.emptyAction}
        </Link>
      </div>
    </main>
  );
}
