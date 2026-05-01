import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";

export default function UserManagement() {
  const { t } = useI18n();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");

  const load = async () => {
    const { data: ps } = await supabase.from("profiles").select("*");
    const { data: rs } = await (supabase as any).from("user_roles").select("user_id,role");
    setUsers(ps ?? []);
    const m: Record<string, string[]> = {};
    (rs ?? []).forEach((r: any) => { (m[r.user_id] = m[r.user_id] || []).push(r.role); });
    setRoles(m);
  };
  useEffect(() => { load(); }, []);

  const filtered = users.filter(u => !q || (u.full_name ?? "").toLowerCase().includes(q.toLowerCase()) || (u.email ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{t("userManagement")}</h1>
          <div className="relative w-64">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="ps-9" placeholder={t("search")} value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <Card className="overflow-hidden"><div className="divide-y">
          {filtered.map(u => (
            <div key={u.id} className="flex items-center gap-3 p-3">
              <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">{(u.full_name ?? u.email ?? "?").slice(0,1).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{u.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{u.email}</div>
              </div>
              <div className="flex gap-1 flex-wrap">{(roles[u.id] ?? []).map(r => <Badge key={r} variant="outline" className="capitalize">{r}</Badge>)}</div>
              <Button size="sm" variant="outline">{t("edit")}</Button>
            </div>
          ))}
          {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">{t("noData")}</div>}
        </div></Card>
        <p className="text-xs text-muted-foreground">User invitations require server-side configuration; new users sign up via the auth page and are auto-assigned the staff role.</p>
      </div>
    </SettingsLayout>
  );
}