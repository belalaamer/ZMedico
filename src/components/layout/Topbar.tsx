import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Search, LogOut, Globe, Calendar, Wallet, Clock, AlertTriangle, Menu, X } from "lucide-react";
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
import { SidebarContent } from "./Sidebar";
import { supabase } from "@/integrations/supabase/client";
import { subscribeResilient } from "@/lib/realtime";
import { GlobalSearch } from "@/components/search/GlobalSearch";

export function Topbar() {
  const { t, lang, setLang } = useI18n();
  const { user, signOut } = useAuth();
  const { branches, currentBranchId, setCurrentBranchId } = useBranch();
  const [now, setNow] = useState(new Date());
  const [notifs, setNotifs] = useState<any[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mobileOpen]);

  const loadNotifs = async () => {
    if (!user?.id) { setNotifs([]); return; }
    const { data } = await supabase
      .from("notifications")
      .select("id,title_en,title_ar,message_en,message_ar,type,related_entity_type,related_entity_id,is_read,created_at")
      .eq("user_id", user.id)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(10);
    // De-duplicate: collapse multiple notifications for the same related entity
    const seen = new Set<string>();
    const unique = (data ?? []).filter((n: any) => {
      const key = n.related_entity_type && n.related_entity_id
        ? `${n.related_entity_type}:${n.related_entity_id}`
        : `id:${n.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setNotifs(unique);
  };

  useEffect(() => {
    loadNotifs();
    if (!user?.id) return;
    return subscribeResilient({
      name: `topbar-notifications:${user.id}`,
      bind: (ch) => ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => loadNotifs()
      ),
      onReconnect: () => loadNotifs(),
    });
    // eslint-disable-next-line
  }, [user?.id]);

  const unreadCount = notifs.length;
  const iconFor = (type: string) => {
    switch (type) {
      case "appointment": return <Calendar className="size-4 text-primary" />;
      case "payment": return <Wallet className="size-4 text-success" />;
      case "follow_up": return <Clock className="size-4 text-info" />;
      case "alert": return <AlertTriangle className="size-4 text-warning" />;
      default: return <Bell className="size-4 text-muted-foreground" />;
    }
  };
  const linkFor = (n: any): string => {
    if (!n.related_entity_type || !n.related_entity_id) return "#";
    switch (n.related_entity_type) {
      case "appointment": return "/calendar";
      case "patient": return `/patients/${n.related_entity_id}`;
      case "invoice": return `/invoices/${n.related_entity_id}`;
      case "payment": return "/payments";
      default: return "#";
    }
  };
  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    loadNotifs();
  };
  const markAllRead = async () => {
    if (!user?.id) return;
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("user_id", user.id).eq("is_read", false);
    loadNotifs();
  };

  const time = now.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", { hour12: true });
  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();

  // Defensive: Radix Select throws if any SelectItem has an empty-string value,
  // and the controlled `value` must either be undefined or match an existing
  // item. Filter out malformed branches and only feed Select a value we can
  // resolve to a rendered item.
  const safeBranches = (branches ?? []).filter(
    (b): b is typeof b => !!b && typeof b.id === "string" && b.id.length > 0,
  );
  const branchValue =
    currentBranchId && safeBranches.some((b) => b.id === currentBranchId)
      ? currentBranchId
      : undefined;
  const branchLabel = (b: { name_en?: string | null; name_ar?: string | null }) =>
    (lang === "ar" ? b.name_ar || b.name_en : b.name_en || b.name_ar) || "—";

  return (
    <header className="h-16 min-h-16 shrink-0 flex items-center gap-2 px-3 sm:gap-3 sm:px-4 md:px-6 border-b border-border bg-card">
      <Button variant="ghost" size="icon" type="button" className="md:hidden size-11 shrink-0" aria-label={t("menu")} onClick={() => setMobileOpen(true)}>
        <Menu className="size-5" />
      </Button>

      <div className="md:hidden" aria-hidden={!mobileOpen}>
        <button
          type="button"
          aria-label={t("closeMenuOverlay")}
          tabIndex={mobileOpen ? 0 : -1}
          className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity duration-150 ease-out ${
            mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          onClick={() => setMobileOpen(false)}
        />

        <aside
          role="dialog"
          aria-modal="true"
          aria-label={t("appName")}
          style={{ willChange: "transform" }}
          className={`fixed inset-y-0 ${lang === "ar" ? "right-0 rounded-l-2xl" : "left-0 rounded-r-2xl"} z-50 w-[min(320px,88vw)] max-w-[calc(100vw-1rem)] bg-sidebar text-sidebar-foreground shadow-2xl ring-1 ring-border overflow-hidden transform-gpu transition-transform duration-150 ease-out ${
            mobileOpen
              ? "translate-x-0 pointer-events-auto"
              : `${lang === "ar" ? "translate-x-full" : "-translate-x-full"} pointer-events-none`
          }`}
        >
          <div className="flex h-16 min-h-16 items-center justify-start border-b border-sidebar-border px-3 py-2 pt-[env(safe-area-inset-top,0px)]">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="size-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              aria-label={t("closeMenu")}
              onClick={() => setMobileOpen(false)}
            >
              <X className="size-5" />
            </Button>
          </div>
          <div className="h-[calc(100%-4rem)] overflow-y-auto py-2">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </aside>
      </div>

      <div className="hidden sm:flex flex-1 max-w-xl">
        <GlobalSearch variant="desktop" />
      </div>
      {searchOpen ? (
        <div className="flex-1 sm:hidden">
          <GlobalSearch variant="mobile" onClose={() => setSearchOpen(false)} />
        </div>
      ) : (
        <div className="flex-1 sm:hidden flex justify-end min-w-0">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="size-11 shrink-0"
            aria-label={t("search")}
            onClick={() => setSearchOpen(true)}
          >
            <Search className="size-5" />
          </Button>
        </div>
      )}

      <div className="hidden sm:block text-sm font-mono tabular-nums text-muted-foreground">
        {time}
      </div>

      {safeBranches.length > 0 ? (
        <Select value={branchValue} onValueChange={setCurrentBranchId}>
          <SelectTrigger className="w-[160px] hidden sm:flex">
            <SelectValue placeholder={t("branch")} />
          </SelectTrigger>
          <SelectContent>
            {safeBranches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {branchLabel(b)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div
          className="w-[160px] hidden sm:flex items-center h-9 px-3 rounded-md border border-input bg-muted/40 text-sm text-muted-foreground truncate"
          aria-label={t("branch")}
        >
          {t("branch")}
        </div>
      )}

      <Button variant="ghost" size="icon" type="button" className="size-11 shrink-0" onClick={() => setLang(lang === "ar" ? "en" : "ar")} title={t("language")} aria-label={t("language")}>
        <Globe className="size-5" />
        <span className="sr-only">{t("language")}</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" type="button" className="relative size-11 shrink-0" aria-label={t("notifications")}>
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -end-1 h-5 min-w-5 px-1 text-[10px] bg-destructive text-destructive-foreground border-0">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-1rem))] max-h-[min(32rem,70dvh)] overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1.5">
            <DropdownMenuLabel className="p-0">{t("notifications")}</DropdownMenuLabel>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline">{t("markAllRead")}</button>
            )}
          </div>
          <DropdownMenuSeparator />
          {unreadCount === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("noNotifications")}</div>
          ) : (
            <div className="max-h-[min(28rem,60dvh)] overflow-y-auto overscroll-contain">
              {notifs.map((n) => (
                <DropdownMenuItem key={n.id} asChild className="cursor-pointer">
                  <Link to={linkFor(n)} onClick={() => markAsRead(n.id)} className="flex items-start gap-2 py-2">
                    <div className="mt-0.5">{iconFor(n.type)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{lang === "ar" ? (n.title_ar || n.title_en) : (n.title_en || n.title_ar)}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{lang === "ar" ? (n.message_ar || n.message_en) : (n.message_en || n.message_ar)}</div>
                    </div>
                  </Link>
                </DropdownMenuItem>
              ))}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={user?.email ?? t("account")} className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-1 py-1 hover:bg-muted touch-manipulation">
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
