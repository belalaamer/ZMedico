import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useOperationScope } from '@/hooks/useOperationScope';

// Client-side single flight only; it does not replace database authorization
// or guarantee idempotency across tabs/reloads after an uncertain response.
export function useInventoryMutation(lang: string, scopeKey: string | null) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const captureScope = useOperationScope(scopeKey);
  const run = async (
    action: () => PromiseLike<{ error: unknown }>,
    confirmed: () => void,
  ) => {
    if (pending.current) return;
    const isCurrent = captureScope();
    if (!isCurrent()) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await action();
      if (!isCurrent()) return;
      if (result.error) throw result.error;
      confirmed();
    } catch (error: unknown) {
      if (!isCurrent()) return;
      const code = typeof error === 'object' && error !== null && 'code' in error
        && typeof error.code === 'string' && /^[A-Z0-9]{5,10}$/.test(error.code)
        ? error.code : 'UNKNOWN';
      console.warn('[inventory-mutation] outcome unconfirmed', { code });
      toast.error(lang === 'ar'
        ? 'تعذر تأكيد نتيجة العملية. راجع حركات المخزون وحالة الطلب قبل إعادة المحاولة.'
        : 'The outcome could not be confirmed. Review stock movements and order status before retrying.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { busy, run, isPending: () => pending.current };
}
