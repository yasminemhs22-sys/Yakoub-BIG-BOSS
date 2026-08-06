import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  useAddTimelineNote,
  useAllowedTransitions,
  useConfirmOrder,
  useDeliveryCompanies,
  useOrderDetail,
  useTransitionOrder,
  useUpdateShipping,
  type ConfirmResult,
} from '@/lib/queries/orders';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { OrderTimeline } from '@/components/admin/OrderTimeline';
import { useAdminText } from '@/auth/useAdminText';
import { useAuth } from '@/auth/AuthProvider';
import { useI18n } from '@/i18n';
import { SkeletonText } from '@/components/Skeleton';

/**
 * Order workspace, built for the phone (D-117).
 *
 * The owner confirms orders standing in the shop, phone in hand. So the call
 * button is the first thing on screen, the note field sits next to it, and the
 * whole layout works one-handed at 375px before it works on a desktop.
 *
 * Every state change goes through a server RPC. Nothing here writes status or
 * stock directly — the rules live in the database where they cannot be
 * bypassed.
 */
export default function OrderDetail() {
  const { id } = useParams();
  const t = useAdminText();
  const { price, locale, pick, date } = useI18n();
  const { can } = useAuth();

  const { data: order, isLoading } = useOrderDetail(id);
  const { data: companies } = useDeliveryCompanies();
  const { data: allowed } = useAllowedTransitions(order?.status.code);

  const confirm = useConfirmOrder();
  const transition = useTransitionOrder();
  const addNote = useAddTimelineNote();
  const updateShipping = useUpdateShipping();

  const [note, setNote] = useState('');
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shipping, setShipping] = useState({
    delivery_company_id: '',
    tracking_number: '',
    shipped_at: '',
    estimated_delivery_at: '',
  });

  useEffect(() => {
    if (!order) return;
    setShipping({
      delivery_company_id: order.delivery_company_id ?? '',
      tracking_number: order.tracking_number ?? '',
      shipped_at: order.shipped_at ?? '',
      estimated_delivery_at: order.estimated_delivery_at ?? '',
    });
  }, [order]);

  if (isLoading || !order) {
    return (
      <main className="p-4 lg:p-8">
        <SkeletonText lines={10} />
      </main>
    );
  }

  const REASON_TEXT: Record<string, string> = {
    already_confirmed: t.orders.alreadyConfirmed,
    illegal_transition: t.orders.illegalTransition,
    variant_missing: t.orders.variantMissing,
  };

  async function runConfirm(allowOversell = false) {
    setError(null);
    setResult(null);
    try {
      const r = await confirm.mutateAsync({
        orderId: id!,
        note: note.trim() || undefined,
        allowOversell,
      });
      setResult(r);
      if (r.ok) setNote('');
    } catch (e) {
      // Overselling without a note, or without the permission, raises rather
      // than returning — surface the real message.
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  async function runTransition(to: string) {
    setError(null);
    setResult(null);
    const r = await transition.mutateAsync({
      orderId: id!,
      toStatus: to,
      note: note.trim() || undefined,
    });
    if (!r.ok) setError(REASON_TEXT[r.reason ?? ''] ?? t.orders.illegalTransition);
    else setNote('');
  }

  const fee = order.delivery_fee_override ?? order.delivery_fee;

  return (
    <main className="space-y-6 p-4 lg:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg text-metal" dir="ltr">
          {order.reference}
        </h1>
        <StatusBadge status={order.status} />
        <span className="ms-auto text-sm text-muted">{date(order.created_at)}</span>
      </div>

      {/* Customer block first: this is what the owner needs on a call. */}
      <section className="card p-5">
        <p className="text-lg">
          {order.first_name} {order.last_name}
        </p>
        <p className="mt-1 text-muted" dir="ltr">
          {order.phone_raw}
        </p>
        <p className="mt-2 text-sm text-muted">
          {[
            order.wilaya && (locale === 'ar' ? order.wilaya.name_ar : order.wilaya.name_fr),
            order.commune && (locale === 'ar' ? order.commune.name_ar : order.commune.name_fr),
            order.method && (locale === 'ar' ? order.method.label_ar : order.method.label_fr),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {order.address && <p className="mt-2 text-sm">{order.address}</p>}
        {order.notes && (
          <p className="mt-2 rounded-control bg-ink-raised p-3 text-sm text-metal">{order.notes}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`tel:${order.phone_raw}`} className="btn-primary">
            {t.orders.call}
          </a>
          <a
            href={`https://wa.me/${order.phone_e164.replace('+', '')}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
          >
            WhatsApp
          </a>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm text-muted">{t.orders.items}</h2>
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span>{pick({ fr: item.product_name_fr, ar: item.product_name_ar })}</span>
              <span className="text-muted">
                {[item.color_name_fr, item.size_label_fr].filter(Boolean).join(' · ')}
              </span>
              <span className="font-mono text-xs text-muted" dir="ltr">
                {item.sku}
              </span>
              {/* A deleted variant leaves the line intact — the snapshot is the
                  record, and confirmation is blocked rather than guessed. */}
              {!item.variant_id && (
                <span className="rounded bg-signal/15 px-2 text-xs text-signal">✕</span>
              )}
              <span className="ms-auto" dir="ltr">
                {item.quantity} × {price(item.unit_price)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-1 border-t border-ink-raised pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">{t.orders.subtotal}</span>
            <span>{price(order.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{t.orders.deliveryFee}</span>
            <span>{price(fee)}</span>
          </div>
          <div className="flex justify-between text-base">
            <span>{t.orders.total}</span>
            <span className="text-neon">{price(order.subtotal + fee)}</span>
          </div>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <textarea
          className="field"
          rows={2}
          placeholder={t.orders.noteOptional}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={!note.trim()}
            onClick={async () => {
              await addNote.mutateAsync({ orderId: id!, note, eventType: 'call_attempt' });
              setNote('');
            }}
          >
            {t.orders.addCallAttempt}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!note.trim()}
            onClick={async () => {
              await addNote.mutateAsync({ orderId: id!, note, eventType: 'note_added' });
              setNote('');
            }}
          >
            {t.orders.addNote}
          </button>
        </div>

        {can('orders.confirm') && allowed?.includes('confirmed') && (
          <button
            type="button"
            className="btn-primary w-full"
            disabled={confirm.isPending}
            onClick={() => runConfirm(false)}
          >
            {confirm.isPending ? t.orders.confirming : t.orders.confirm}
          </button>
        )}

        {/* Insufficient stock names the short lines rather than failing
            generically — the owner needs to know WHICH item to chase. */}
        {result && !result.ok && result.reason === 'insufficient_stock' && (
          <div className="rounded-control bg-signal/10 p-3 text-sm">
            <p className="text-signal">{t.orders.insufficientStock}</p>
            <ul className="mt-2 space-y-1">
              {result.lines?.map((l) => (
                <li key={l.sku} className="text-metal" dir="ltr">
                  {l.product} — {l.sku}: {l.requested} / {l.available}
                </li>
              ))}
            </ul>

            {can('orders.oversell') && (
              <>
                <p className="mt-3 text-xs text-muted">{t.orders.oversellWarning}</p>
                <button
                  type="button"
                  className="btn-secondary mt-2"
                  disabled={!note.trim()}
                  onClick={() => runConfirm(true)}
                >
                  {t.orders.oversell}
                </button>
                {!note.trim() && (
                  <p className="mt-1 text-xs text-signal">{t.orders.noteRequired}</p>
                )}
              </>
            )}
          </div>
        )}

        {result && !result.ok && result.reason !== 'insufficient_stock' && (
          <p className="rounded-control bg-signal/10 p-3 text-sm text-signal">
            {REASON_TEXT[result.reason] ?? t.orders.illegalTransition}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-control bg-signal/10 p-3 text-sm text-signal">
            {error}
          </p>
        )}

        {can('orders.update') && (
          <div>
            <p className="mb-2 text-sm text-muted">{t.orders.changeStatus}</p>
            <div className="flex flex-wrap gap-2">
              {allowed
                ?.filter((code) => code !== 'confirmed')
                .map((code) => (
                  <button
                    key={code}
                    type="button"
                    className="btn-secondary px-3 py-1.5 text-sm"
                    onClick={() => runTransition(code)}
                  >
                    {code}
                  </button>
                ))}
            </div>
          </div>
        )}
      </section>

      {can('orders.update') && (
        <section className="card space-y-4 p-5">
          <h2 className="text-sm text-muted">{t.orders.shipping}</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs text-muted">{t.orders.company}</label>
              <select
                className="field"
                value={shipping.delivery_company_id}
                onChange={(e) =>
                  setShipping({ ...shipping, delivery_company_id: e.target.value })
                }
              >
                <option value="">—</option>
                {companies?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-muted">{t.orders.tracking}</label>
              <input
                className="field"
                dir="ltr"
                value={shipping.tracking_number}
                onChange={(e) => setShipping({ ...shipping, tracking_number: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-muted">{t.orders.shippedAt}</label>
              <input
                className="field"
                type="date"
                value={shipping.shipped_at}
                onChange={(e) => setShipping({ ...shipping, shipped_at: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-muted">{t.orders.estimatedAt}</label>
              <input
                className="field"
                type="date"
                value={shipping.estimated_delivery_at}
                onChange={(e) =>
                  setShipping({ ...shipping, estimated_delivery_at: e.target.value })
                }
              />
            </div>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              updateShipping.mutate({
                orderId: id!,
                patch: {
                  delivery_company_id: shipping.delivery_company_id || null,
                  tracking_number: shipping.tracking_number || null,
                  shipped_at: shipping.shipped_at || null,
                  estimated_delivery_at: shipping.estimated_delivery_at || null,
                },
              })
            }
          >
            {t.orders.saveShipping}
          </button>
        </section>
      )}

      <section className="card p-5">
        <h2 className="mb-4 text-sm text-muted">{t.orders.timeline}</h2>
        <OrderTimeline timeline={order.timeline} />
      </section>
    </main>
  );
}
