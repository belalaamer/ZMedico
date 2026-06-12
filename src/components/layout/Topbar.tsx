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
    const ch = supabase
      .channel("topbar-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => loadNotifs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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

  return (
    <header className="h-16 shrink-0 flex items-center gap-3 px-4 md:px-6 border-b border-border bg-card">
      <Button variant="ghost" size="icon" type="button" className="md:hidden" aria-label="Menu" onClick={() => setMobileOpen(true)}>
        <Menu className="size-5" />
      </Button>

      <div className="md:hidden" aria-hidden={!mobileOpen}>
        <button
          type="button"
          aria-label="Close menu overlay"
          tabIndex={mobileOpen ? 0 : -1}
          className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] transition-opacity duration-150 ease-out ${
            mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          onClick={() => setMobileOpen(false)}
        />

        <aside
          role="dialog"
          aria-modal="true"
          aria-label={t("appName")}
          style={{ willChange: "transform" }}
          className={`fixed inset-y-0 ${lang === "ar" ? "right-0" : "left-0"} z-50 w-[280px] max-w-[82vw] border-sidebar-border bg-sidebar text-sidebar-foreground shadow-elegant transform-gpu transition-transform duration-150 ease-out ${
            mobileOpen
              ? "translate-x-0 pointer-events-auto"
              : `${lang === "ar" ? "translate-x-full" : "-translate-x-full"} pointer-events-none`
          }`}
        >
          <div className="flex h-16 items-center justify-end border-b border-sidebar-border px-3">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            >
              <X className="size-5" />
            </Button>
          </div>
          <div className="h-[calc(100%-4rem)] overflow-y-auto">
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
        <div className="flex-1 sm:hidden flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            type="button"
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

      <Button variant="ghost" size="icon" type="button" onClick={() => setLang(lang === "ar" ? "en" : "ar")} title="Language">
        <Globe className="size-5" />
        <span className="sr-only">Language</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" type="button" className="relative" aria-label={t("notifications")}>
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -end-1 h-5 min-w-5 px-1 text-[10px] bg-destructive text-destructive-foreground border-0">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
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
            <div className="max-h-96 overflow-y-auto">
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
          <button type="button" className="flex items-center gap-2 rounded-full hover:bg-muted px-1 py-1">
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