import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";

type Position = {
  id: string;
  title_en: string;
  title_ar: string;
  group_key: string | null;
  sort_order: number | null;
};

interface Props {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
}

/**
 * Unified Job/Role dropdown — single source of truth for staff_positions.
 * Options are sorted by group_key, then sort_order, then localized title.
 * Related jobs are visually grouped (optgroup-style) by group_key.
 */
export default function JobRoleSelect({ value, onChange, placeholder, allowNone = true, noneLabel, className }: Props) {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Position[]>([]);

  useEffect(() => {
    let alive = true;
    supabase
      .from("staff_positions")
      .select("id,title_en,title_ar,group_key,sort_order")
      .is("deleted_at", null)
      .then(({ data }) => { if (alive) setItems((data as any) ?? []); });
    return () => { alive = false; };
  }, []);

  const grouped = useMemo(() => {
    const label = (p: Position) => (lang === "ar" ? p.title_ar : p.title_en) || p.title_en || p.title_ar;
    const sorted = [...items].sort((a, b) => {
      const ga = (a.group_key || "zzz").toLowerCase();
      const gb = (b.group_key || "zzz").toLowerCase();
      if (ga !== gb) return ga.localeCompare(gb);
      const oa = a.sort_order ?? 0; const ob = b.sort_order ?? 0;
      if (oa !== ob) return oa - ob;
      return label(a).localeCompare(label(b), lang === "ar" ? "ar" : "en");
    });
    const map = new Map<string, Position[]>();
    for (const p of sorted) {
      const k = (p.group_key || "general").toLowerCase();
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return Array.from(map.entries());
  }, [items, lang]);

  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
      <SelectTrigger className={className}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value="none">— {noneLabel ?? t("none")} —</SelectItem>}
        {grouped.map(([group, list]) => (
          <SelectGroup key={group}>
            <SelectLabel className="capitalize">{group}</SelectLabel>
            {list.map((p) => (
              <SelectItem key={p.id} value={p.id}>{lang === "ar" ? p.title_ar : p.title_en}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}