import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useOperationScope } from "./useOperationScope";

type Result = { data: { id: string } | null; error: unknown };

export function useConfirmedRowMutation(scopeKey: string | null, lang: string, successText: string) {
  const captureScope = useOperationScope(scopeKey);
  const pending = useRef(new Set<string>());
  const mounted = useRef(false);
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const keyFor = (id: string) => `${scopeKey}:${id}`;

  const run = async (id: string, request: () => PromiseLike<Result>, refresh: () => Promise<unknown>) => {
    const isCurrent = captureScope();
    const key = keyFor(id);
    if (!isCurrent() || pending.current.has(key)) return;
    pending.current.add(key);
    setPendingKeys(new Set(pending.current));
    try {
      const { data, error } = await request();
      if (error) throw error;
      if (!data || data.id !== id) throw new Error("Row update not confirmed");
      if (!isCurrent()) return;
      toast.success(successText);
      try { await refresh(); } catch {
        if (isCurrent()) toast.error(lang === "ar"
          ? "تم حفظ التغيير، لكن تعذر تحديث القائمة. حدّث الصفحة."
          : "The change was saved, but the list could not be refreshed. Refresh the page.");
      }
    } catch (error) {
      if (!isCurrent()) return;
      const denied = error && typeof error === "object" && "code" in error && error.code === "42501";
      toast.error(denied
        ? (lang === "ar" ? "ليس لديك صلاحية تعديل هذا السجل." : "You do not have permission to change this record.")
        : (lang === "ar" ? "تعذر تأكيد التغيير. حدّث القائمة قبل إعادة المحاولة." : "The change could not be confirmed. Refresh the list before retrying."));
    } finally {
      pending.current.delete(key);
      if (mounted.current) setPendingKeys(new Set(pending.current));
    }
  };
  return { run, isPending: (id: string) => pendingKeys.has(keyFor(id)) };
}
