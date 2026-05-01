import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Search, LogOut, Globe, AlertTriangle, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export function Topbar() {
  const { t, lang, setLang } = useI18n();
  const { user, signOut } = useAuth();
  const { branches, currentBranchId, setCurrentBranchId } = useBranch();
  const [now, setNow] = useState(new Date());
  const [alertCount, setAlertCount] = useState(0);
  const [alertBreakdown, setAlertBreakdown] = useState<Record<string, number>>({});

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadAlerts = async () => {
    const q = supabase.from("stock_alerts").select("alert_type", { count: "exact" }).eq("is_resolved", false);
    const { data, count } = currentBranchId ? await q.eq("branch_id", currentBranchId) : await q;
    setAlertCount(count ?? 0);
    const map: Record<string, number> = {};
    (data ?? []).forEach((r: any) => { map[r.alert_type] = (map[r.alert_type] ?? 0) + 1; });
    setAlertBreakdown(map);
  };

  useEffect(() => {
    loadAlerts();
    const ch = supabase
      .channel("topbar-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_alerts" }, () => loadAlerts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [currentBranchId]);

  const time = now.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", { hour12: true });
  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();

  return (
    <header className="h-16 shrink-0 flex items-center gap-3 px-4 md:px-6 border-b border-border bg-card">
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input placeholder={t("search")} className="ps-9 bg-muted/50 border-transparent focus-visible:bg-background" />
      </div>

      <div className="hidden sm:block text-sm font-mono tabular-nums text-muted-foreground">
        {time}
      </div>

      <Select value={currentBranchId ?? undefined} onValueChange={setCurrentBranchId}>
        <SelectTrigger className="w-[160px] hidden sm:flex">
          <SelectValue placeholder={t("branch")} />
        </SelectTrigger>
        <SelectContent>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="ghost" size="icon" onClick={() => setLang(lang === "ar" ? "en" : "ar")} title="Language">
        <Globe className="size-5" />
        <span className="sr-only">Language</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label={t("notifications")}>
            <Bell className="size-5" />
            {alertCount > 0 && (
              <Badge className="absolute -top-1 -end-1 h-5 min-w-5 px-1 text-[10px] bg-destructive text-destructive-foreground border-0">
                {alertCount > 99 ? "99+" : alertCount}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>{t("notifications")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {alertCount === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("noAlerts")}</div>
          ) : (
            <>
              {alertBreakdown.out_of_stock > 0 && (
                <DropdownMenuItem asChild>
                  <Link to="/inventory/alerts" className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><PackageX className="size-4 text-destructive" />{t("outOfStock")}</span>
                    <Badge variant="outline" className="status-departed">{alertBreakdown.out_of_stock}</Badge>
                  </Link>
                </DropdownMenuItem>
              )}
              {alertBreakdown.low_stock > 0 && (
                <DropdownMenuItem asChild>
                  <Link to="/inventory/alerts" className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><AlertTriangle className="size-4 text-warning" />{t("lowStock")}</span>
                    <Badge variant="outline" className="status-progress">{alertBreakdown.low_stock}</Badge>
                  </Link>
                </DropdownMenuItem>
              )}
              {alertBreakdown.expiring_soon > 0 && (
                <DropdownMenuItem asChild>
                  <Link to="/inventory/alerts" className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><AlertTriangle className="size-4 text-warning" />{t("expiringSoon")}</span>
                    <Badge variant="outline" className="status-progress">{alertBreakdown.expiring_soon}</Badge>
                  </Link>
                </DropdownMenuItem>
              )}
              {alertBreakdown.expired > 0 && (
                <DropdownMenuItem asChild>
                  <Link to="/inventory/alerts" className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><PackageX className="size-4 text-destructive" />{t("expired")}</span>
                    <Badge variant="outline" className="status-departed">{alertBreakdown.expired}</Badge>
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/inventory/alerts" className="text-primary">{t("viewAlerts")}</Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full hover:bg-muted px-1 py-1">
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="me-2 size-4" /> {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}