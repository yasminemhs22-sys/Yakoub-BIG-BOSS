import { useCallback, useEffect, useState } from 'react';

/**
 * The cart.
 *
 * It stores variant ids and quantities. NOTHING ELSE — no prices, no names, no
 * totals (D-273).
 *
 * This is the single most important integrity rule in the checkout: because the
 * client never sends a price, a tampered request cannot change what an order
 * costs. Every monetary value is computed server-side in place_order() from the
 * database (D-274), and Phase 1 verified that end to end.
 *
 * Persisted locally so a customer who closes the tab does not lose their
 * basket. No account required (D-024).
 */
const KEY = 'ybb.cart';

export interface CartLine {
  variantId: string;
  quantity: number;
}

function read(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (l): l is CartLine =>
          typeof l?.variantId === 'string' && Number.isFinite(l?.quantity) && l.quantity > 0,
      )
      .slice(0, 50);
  } catch {
    // Corrupt or blocked storage must not break the shop.
    return [];
  }
}

function write(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
    window.dispatchEvent(new CustomEvent('ybb:cart'));
  } catch {
    /* private mode */
  }
}

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(read);

  useEffect(() => {
    const sync = () => setLines(read());
    window.addEventListener('ybb:cart', sync);
    // Keep two open tabs in step.
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('ybb:cart', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const add = useCallback((line: CartLine) => {
    const next = read();
    const found = next.find((l) => l.variantId === line.variantId);
    if (found) found.quantity = Math.min(found.quantity + line.quantity, 20);
    else next.push({ ...line, quantity: Math.min(line.quantity, 20) });
    write(next);
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    const next = read()
      .map((l) => (l.variantId === variantId ? { ...l, quantity } : l))
      .filter((l) => l.quantity > 0);
    write(next);
  }, []);

  const remove = useCallback((variantId: string) => {
    write(read().filter((l) => l.variantId !== variantId));
  }, []);

  const clear = useCallback(() => write([]), []);

  return {
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    add,
    setQuantity,
    remove,
    clear,
  };
}
