import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Bell, Check, Trash2, Inbox, Clock, AlertTriangle, Calendar as CalIcon, CreditCard, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { subscribeResilient } from "@/lib/realtime";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Notif = {
  id: string; user_id: string;
  title_ar: string; title_en: string;
  message_ar: string; message_en: string;
  type: "appointment" | "payment" | "follow_up" | "system" | "alert";
  related_entity_type: string | null; related_entity_id: string | null;
  is_read: boolean; created_at: string;
};

const typeIcon: Record<Notif["type"], any> = {
  appointment: CalIcon, payment: CreditCard, follow_up: RefreshCw, system: SettingsIcon, alert: AlertTriangle,
};

function entityLink(n: Notif): string | null {
  if (!n.related_entity_id) return null;
  switch (n.related_entity_type) {
    case "patient": return `/patients/${n.related_entity_id}`;
    case "invoice": return `/invoices/${n.related_entity_id}`;
    case "appointment": return `/calendar`;
    default: return null;
  }
}

export default function Reminders() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const { pathname } = useLocation();
  const [items, setItems] = useState<Notif[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const isScheduled = pathname.startsWith("/reminders/scheduled");

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications").select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    // De-duplicate notifications by related entity (keeps most recent)
    const seen = new Set<string>();
    const unique = ((data ?? []) as Notif[]).filter((n) => {
      const key = n.related_entity_type && n.related_entity_id
        ? `${n.related_entity_type}:${n.related_entity_id}`
        : `id:${n.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setItems(unique);
  };

  useEffect(() => {
    load();
    if (!user) return;
    return subscribeResilient({
      name: `notif:${user.id}`,
      bind: (ch) => ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load()
      ),
      onReconnect: () => load(),
    });
    // eslint-disable-next-line
  }, [user?.id]);

  const filtered = useMemo(() => items.filter((n) =>
    (filter === "all" || (filter === "unread" ? !n.is_read : n.is_read)) &&
    (typeFilter === "all" || n.type === typeFilter)
  ), [items, filter, typeFilter]);

  const unreadCount = items.filter((n) => !n.is_read).length;

  const markRead = async (id: string, val = true) => {
    await supabase.from("notifications")
      .update({ is_read: val, read_at: val ? new Date().toISOString() : null }).eq("id", id);
    load();
  };
  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("is_read", false);
    toast({ title: t("markAllAsRead") });
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="size-6 text-primary" /> {t("notificationsCenter")}
          </h1>
          <p className="text-sm text-muted-foreground">{unreadCount} {t("unread")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0}>
            <Check className="size-4 me-1" />{t("markAllAsRead")}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b">
        <NavLink to="/reminders" end className={({ isActive }) => cn("px-4 py-2 text-sm font-medium border-b-2", isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <Inbox className="size-4 inline me-1" />{t("notificationsCenter")}
        </NavLink>
        <NavLink to="/reminders/scheduled" className={({ isActive }) => cn("px-4 py-2 text-sm font-medium border-b-2", isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <Clock className="size-4 inline me-1" />{t("scheduledReminders")}
        </NavLink>
      </div>

      {isScheduled ? <Outlet /> : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
              <TabsList>
                <TabsTrigger value="all">{t("all")}</TabsTrigger>
                <TabsTrigger value="unread">{t("unread")} {unreadCount > 0 && <Badge className="ms-1" variant="secondary">{unreadCount}</Badge>}</TabsTrigger>
                <TabsTrigger value="read">{t("read")}</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                <SelectItem value="appointment">{t("appointment")}</SelectItem>
                <SelectItem value="payment">{t("payment")}</SelectItem>
                <SelectItem value="follow_up">{t("follow_up")}</SelectItem>
                <SelectItem value="system">{t("system")}</SelectItem>
                <SelectItem value="alert">{t("alert")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <div className="text-center text-muted-foreground py-16">
                  <Inbox className="size-10 mx-auto mb-2 opacity-40" />
                  {t("noData")}
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((n) => {
                    const Icon = typeIcon[n.type] ?? Bell;
                    const link = entityLink(n);
                    const title = lang === "ar" ? (n.title_ar || n.title_en) : (n.title_en || n.title_ar);
                    const message = lang === "ar" ? (n.message_ar || n.message_en) : (n.message_en || n.message_ar);
                    const Wrapper: any = link ? Link : "div";
                    return (
                      <li key={n.id} className={cn("flex gap-3 p-4 hover:bg-muted/40 transition", !n.is_read && "bg-primary/5")}>
                        <div className={cn("size-10 rounded-full flex items-center justify-center shrink-0",
                          n.type === "alert" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                          <Icon className="size-5" />
                        </div>
                        <Wrapper to={link ?? undefined} className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-semibold truncate", !n.is_read && "text-foreground")}>{title}</span>
                            {!n.is_read && <span className="size-2 rounded-full bg-primary shrink-0" />}
                          </div>
                          {message && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{message}</p>}
                          <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</p>
                        </Wrapper>
                        <div className="flex items-start gap-1">
                          {!n.is_read && (
                            <Button variant="ghost" size="icon" onClick={() => markRead(n.id, true)} title={t("markAsRead")}>
                              <Check className="size-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => remove(n.id)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}