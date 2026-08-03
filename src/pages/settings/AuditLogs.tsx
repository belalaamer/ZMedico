import { useEffect, useMemo, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ListSkeleton } from "@/components/ListSkeleton";
import { TablePager } from "@/components/TablePager";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { Info, AlertTriangle } from "lucide-react";

const PAGE_SIZE = 10;

type AuditRow = {
  id: string;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  user_id: string | null;
  profiles?: { full_name: string | null; email: string | null } | null;
};

function actionTone(action: string | null) {
  const a = (action ?? "").toLowerCase();
  if (a === "create" || a === "insert") {
    return "bg-success/15 text-success border-success/30";
  }
  if (a === "update") {
    return "bg-info/15 text-info border-info/30";
  }
  if (a === "delete") {
    return "bg-destructive/15 text-destructive border-destructive/30";
  }
  return "";
}

function initials(name?: string | null, fallback?: string | null) {
  const src = (name || fallback || "?").trim();
  const parts = src.split(/\s+/).slice(0, 2);
  return parts.map(p => p.charAt(0).toUpperCase()).join("") || "?";
}

function formatDateCell(iso: string, lang: "ar" | "en" | string) {
  const d = new Date(iso);
  const locale = lang === "ar" ? "ar" : "en-GB";
  return {
    date: d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "2-digit" }),
    time: d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

export default function AuditLogs() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<AuditRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(null);

    (supabase as any).from("audit_logs")
      .select("id,action,entity_type,entity_id,created_at,user_id, profiles(full_name, email)")
      .order("created_at", { ascending: false }).limit(100)
      .then(({ data, error }: any) => {
        if (!active) return;
        // Previously the `error` field was ignored entirely. A permission
        // denial (RLS or a missing GRANT) then rendered as an empty table,
        // which is exactly how the July 2026 outage stayed invisible.
        if (error) {
          setLoadError(error.message ?? "Unknown error");
          setItems([]);
        } else {
          setItems((data ?? []) as AuditRow[]);
        }
        setIsLoading(false);
      })
      // Previously there was no .catch(), so a rejected promise left the
      // spinner running forever with no explanation.
      .catch((err: any) => {
        if (!active) return;
        setLoadError(err?.message ?? "Request failed");
        setItems([]);
        setIsLoading(false);
      });

    return () => { active = false; };
  }, []);

  const entityTypes = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => { if (i.entity_type) s.add(i.entity_type); });
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => items.filter(i => {
    if (actionFilter !== "all" && (i.action ?? "").toLowerCase() !== actionFilter) return false;
    if (entityFilter !== "all" && (i.entity_type ?? "") !== entityFilter) return false;
    if (q) {
      const needle = q.toLowerCase();
      const hay = [
        i.entity_type, i.action, i.entity_id, i.user_id,
        i.profiles?.full_name, i.profiles?.email,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  }), [items, q, actionFilter, entityFilter]);

  useEffect(() => { setPage(0); }, [q, actionFilter, entityFilter]);

  const total = filtered.length;
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{t("auditLogs")}</h1>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm flex gap-2">
          <Info className="size-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-muted-foreground">
            {lang === "ar"
              ? "سجل التدقيق مخصص للقراءة فقط (إلحاق دائم). لا يتم حذف أو تعديل أي إدخال. يتم الاحتفاظ بآخر 100 إدخال هنا للعرض السريع؛ السجل الكامل متاح في قاعدة البيانات."
              : "The audit log is append-only — entries cannot be edited or deleted. This view shows the latest 100 events for fast review; the full history is retained in the database."}
          </p>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm flex gap-2">
            <AlertTriangle className="size-4 mt-0.5 text-destructive shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-destructive">
                {lang === "ar" ? "تعذّر تحميل سجل التدقيق" : "Could not load the audit log"}
              </p>
              <p className="text-muted-foreground break-words">{loadError}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
          <Input
            className="w-full md:w-72"
            placeholder={t("search")}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل الإجراءات" : "All actions"}</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="insert">Insert</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Entity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل الكيانات" : "All entities"}</SelectItem>
              {entityTypes.map(e => (
                <SelectItem key={e} value={e} className="capitalize">{e.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-4"><ListSkeleton rows={8} /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[180px]">{lang === "ar" ? "التاريخ / الوقت" : "Date / Time"}</TableHead>
                      <TableHead>{lang === "ar" ? "المستخدم" : "User"}</TableHead>
                      <TableHead className="w-[120px]">{lang === "ar" ? "الإجراء" : "Action"}</TableHead>
                      <TableHead className="w-[160px]">{lang === "ar" ? "نوع الكيان" : "Entity type"}</TableHead>
                      <TableHead>{lang === "ar" ? "معرّف الكيان" : "Entity ID"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map(i => {
                      const { date, time } = formatDateCell(i.created_at, lang);
                      const displayName = i.profiles?.full_name
                        || i.profiles?.email
                        || (i.user_id ? `${i.user_id.slice(0, 8)}…` : (lang === "ar" ? "النظام" : "System"));
                      const subLabel = i.profiles?.full_name ? i.profiles?.email : (i.profiles?.email ? null : i.user_id);
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="align-top">
                            <div className="text-sm font-medium tabular-nums">{date}</div>
                            <div className="text-xs text-muted-foreground tabular-nums">{time}</div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar className="size-7 shrink-0">
                                <AvatarFallback className="text-[10px]">
                                  {initials(i.profiles?.full_name, i.profiles?.email ?? i.user_id)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{displayName}</div>
                                {subLabel && (
                                  <div className="text-xs text-muted-foreground truncate">{subLabel}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="outline" className={`capitalize ${actionTone(i.action)}`}>
                              {i.action ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="outline" className="capitalize">
                              {i.entity_type ? i.entity_type.replace(/_/g, " ") : "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="text-xs text-muted-foreground font-mono truncate max-w-[240px]">
                              {i.entity_id ?? "—"}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {pageRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="p-8 text-center text-muted-foreground">
                          {loadError
                            ? (lang === "ar" ? "لم يتم تحميل البيانات بسبب خطأ" : "Data could not be loaded due to an error")
                            : t("noData")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </>
          )}
        </Card>
      </div>
    </SettingsLayout>
  );
}
