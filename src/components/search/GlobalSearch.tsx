import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from "@/components/ui/popover";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  searchPatients, searchInvoices, searchAppointments,
  searchPayments, searchMedicalRecords, searchPrescriptions, searchStaff,
  type SearchGroup, type SearchHit, type SearchGroupKey,
} from "@/lib/globalSearch";

const DEBOUNCE_MS = 250;

type Props = { variant?: "desktop" | "mobile"; onClose?: () => void };

export function GlobalSearch({ variant = "desktop", onClose }: Props) {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { can, loading: permLoading } = usePermissions();
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const minLen = useMemo(() => (/^\d+$/.test(q.trim()) ? 1 : 2), [q]);

  // Build the list of groups the current user is allowed to see.
  const allowedGroups = useMemo<{ key: SearchGroupKey; module: string; label: string }[]>(() => {
    const labels: Record<SearchGroupKey, string> = {
      patients:        lang === "ar" ? "المرضى" : "Patients",
      invoices:        lang === "ar" ? "الفواتير" : "Invoices",
      appointments:    lang === "ar" ? "المواعيد" : "Appointments",
      payments:        lang === "ar" ? "المدفوعات" : "Payments",
      medical_records: lang === "ar" ? "السجلات الطبية" : "Medical records",
      prescriptions:   lang === "ar" ? "الوصفات" : "Prescriptions",
      staff:           lang === "ar" ? "الموظفون" : "Staff",
    };
    const defs: { key: SearchGroupKey; module: string }[] = [
      { key: "patients",        module: "patients" },
      { key: "invoices",        module: "invoices" },
      { key: "appointments",    module: "appointments" },
      { key: "payments",        module: "invoices" },
      { key: "medical_records", module: "medical_records" },
      { key: "prescriptions",   module: "medical_records" },
      { key: "staff",           module: "hr" },
    ];
    return defs.filter((d) => can(d.module, "view")).map((d) => ({ ...d, label: labels[d.key] }));
  }, [can, lang, permLoading]);

  // Debounced search
  useEffect(() => {
    const term = q.trim();
    if (term.length < minLen) {
      setGroups([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      const runners: Record<SearchGroupKey, (q: string, b: string | null, l: "en" | "ar") => Promise<SearchHit[]>> = {
        patients: searchPatients,
        invoices: searchInvoices,
        appointments: searchAppointments,
        payments: searchPayments,
        medical_records: searchMedicalRecords,
        prescriptions: searchPrescriptions,
        staff: searchStaff,
      };
      const results = await Promise.all(
        allowedGroups.map(async (g) => {
          try {
            const hits = await runners[g.key](term, currentBranchId ?? null, lang);
            return { key: g.key, module: g.module, hits } as SearchGroup;
          } catch {
            return { key: g.key, module: g.module, hits: [] } as SearchGroup;
          }
        }),
      );
      if (cancelled) return;
      setGroups(results);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [q, minLen, currentBranchId, lang, allowedGroups]);

  const groupLabel = (k: SearchGroupKey): string => allowedGroups.find((g) => g.key === k)?.label ?? k;

  const visibleGroups = groups.filter((g) => g.hits.length > 0);
  const totalHits = visibleGroups.reduce((s, g) => s + g.hits.length, 0);

  const go = (to: string) => {
    setOpen(false);
    setQ("");
    onClose?.();
    navigate(to);
  };

  // Flat list for Enter navigation
  const flatHits = useMemo(() => visibleGroups.flatMap((g) => g.hits), [visibleGroups]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
    if (e.key === "Enter" && flatHits.length > 0) {
      e.preventDefault();
      go(flatHits[0].to);
    }
  };

  const isMobile = variant === "mobile";

  return (
    <Popover open={open && q.trim().length >= minLen} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={`relative ${isMobile ? "flex-1" : "flex-1 max-w-xl"}`}>
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => { if (q.trim().length >= minLen) setOpen(true); }}
            onKeyDown={onKeyDown}
            placeholder={t("search")}
            autoFocus={isMobile}
            className="ps-9 bg-muted/50 border-transparent focus-visible:bg-background"
          />
          {loading && (
            <Loader2 className="absolute end-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin" />
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[min(560px,calc(100vw-2rem))] p-0 max-h-[70vh] overflow-y-auto"
      >
        {loading && totalHits === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            {lang === "ar" ? "جارٍ البحث..." : "Searching..."}
          </div>
        ) : totalHits === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">{t("noResults")}</div>
        ) : (
          <div className="py-2">
            {visibleGroups.map((g) => (
              <div key={g.key} className="px-1">
                <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                  {groupLabel(g.key)} <span className="opacity-60">({g.hits.length})</span>
                </div>
                <ul>
                  {g.hits.map((h) => (
                    <li key={`${g.key}:${h.id}`}>
                      <button
                        type="button"
                        onClick={() => go(h.to)}
                        className="w-full text-start px-3 py-2 rounded-md hover:bg-muted focus:bg-muted focus:outline-none"
                      >
                        <div className="text-sm font-medium truncate">{h.label}</div>
                        {h.sub && <div className="text-xs text-muted-foreground truncate">{h.sub}</div>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default GlobalSearch;