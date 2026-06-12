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
  const [highlight, setHighlight] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  // Stable signature so the search effect doesn't re-fire on every render
  // (usePermissions returns a fresh `can` each render, which would otherwise
  // change `allowedGroups`'s identity and re-trigger fetches in a loop).
  const allowedKey = allowedGroups.map((g) => g.key).join(",");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, minLen, currentBranchId, lang, allowedKey]);

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

  // Reset highlight to first item whenever the result set changes.
  useEffect(() => { setHighlight(0); }, [flatHits.length, q]);

  // Keep highlighted row in view as the user arrows through results.
  useEffect(() => {
    const el = itemRefs.current[highlight];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  // Global Ctrl+K / Cmd+K to open & focus the search input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(true);
        // Defer focus to next tick so the input is mounted/visible.
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (flatHits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % flatHits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + flatHits.length) % flatHits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flatHits[Math.min(highlight, flatHits.length - 1)];
      if (target) go(target.to);
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
            {(() => { itemRefs.current = []; let idx = -1; return visibleGroups.map((g) => (
              <div key={g.key} className="px-1">
                <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                  {groupLabel(g.key)} <span className="opacity-60">({g.hits.length})</span>
                </div>
                <ul>
                  {g.hits.map((h) => {
                    idx += 1;
                    const myIdx = idx;
                    const active = myIdx === highlight;
                    return (
                      <li key={`${g.key}:${h.id}`}>
                        <button
                          type="button"
                          ref={(el) => { itemRefs.current[myIdx] = el; }}
                          onMouseEnter={() => setHighlight(myIdx)}
                          onClick={() => go(h.to)}
                          aria-selected={active}
                          className={`w-full text-start px-3 py-2 rounded-md focus:outline-none ${active ? "bg-muted ring-1 ring-primary/40" : "hover:bg-muted"}`}
                        >
                          <div className="text-sm font-medium truncate">{h.label}</div>
                          {h.sub && <div className="text-xs text-muted-foreground truncate">{h.sub}</div>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )); })()}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default GlobalSearch;