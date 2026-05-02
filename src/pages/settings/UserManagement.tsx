import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { Search, UserPlus, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const ROLES = ["admin", "manager", "doctor", "nurse", "receptionist", "accountant", "staff"] as const;
type Role = typeof ROLES[number];

export default function UserManagement() {
  const { t, lang } = useI18n();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");
  const [invites, setInvites] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invRole, setInvRole] = useState<Role>("staff");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data: ps } = await supabase.from("profiles").select("*");
    const { data: rs } = await (supabase as any).from("user_roles").select("user_id,role");
    const { data: inv } = await (supabase as any)
      .from("allowed_signup_emails")
      .select("id,email,role,full_name,created_at")
      .order("created_at", { ascending: false });
    setUsers(ps ?? []);
    const m: Record<string, string[]> = {};
    (rs ?? []).forEach((r: any) => { (m[r.user_id] = m[r.user_id] || []).push(r.role); });
    setRoles(m);
    setInvites(inv ?? []);
  };
  useEffect(() => { load(); }, []);

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = invEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error(lang === "ar" ? "أدخل بريداً صالحاً" : "Enter a valid email");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("allowed_signup_emails").insert({
      email,
      role: invRole,
      full_name: invName.trim() || null,
      created_by: u.user?.id ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(
      lang === "ar"
        ? "تمت الدعوة. اطلب من المستخدم التسجيل بهذا البريد."
        : "Invited. Ask the user to sign up with this email."
    );
    setInvEmail(""); setInvName(""); setInvRole("staff"); setOpen(false);
    load();
  };

  const revokeInvite = async (id: string) => {
    const { error } = await (supabase as any).from("allowed_signup_emails").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم إلغاء الدعوة" : "Invite revoked");
    load();
  };

  const filtered = users.filter(u => !q || (u.full_name ?? "").toLowerCase().includes(q.toLowerCase()) || (u.email ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{t("userManagement")}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-64">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input className="ps-9" placeholder={t("search")} value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <Button onClick={() => setOpen(true)} className="gradient-primary text-primary-foreground">
              <UserPlus className="me-2 size-4" />
              {lang === "ar" ? "دعوة مستخدم" : "Invite user"}
            </Button>
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

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{lang === "ar" ? "الدعوات المعلقة" : "Pending invites"}</h2>
          <Card className="overflow-hidden"><div className="divide-y">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{i.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">{i.email}</div>
                </div>
                {i.role && <Badge variant="outline" className="capitalize">{i.role}</Badge>}
                <Button size="sm" variant="outline" onClick={() => revokeInvite(i.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {invites.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {lang === "ar" ? "لا توجد دعوات معلقة" : "No pending invites"}
              </div>
            )}
          </div></Card>
          <p className="text-xs text-muted-foreground">
            {lang === "ar"
              ? "ادعُ المستخدم بإضافة بريده هنا، ثم اطلب منه فتح صفحة تسجيل الدخول والتسجيل بنفس البريد. سيتم تعيين الدور تلقائياً."
              : "Add the user's email here, then ask them to sign up on the login page using the same email. Their role will be assigned automatically."}
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{lang === "ar" ? "دعوة مستخدم جديد" : "Invite a new user"}</DialogTitle>
              <DialogDescription>
                {lang === "ar"
                  ? "سيتمكن المستخدم من إنشاء حساب باستخدام هذا البريد."
                  : "The user will be able to create an account using this email."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={sendInvite} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invEmail">{lang === "ar" ? "البريد الإلكتروني" : "Email"}</Label>
                <Input id="invEmail" type="email" required value={invEmail} onChange={(e) => setInvEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invName">{lang === "ar" ? "الاسم الكامل" : "Full name"}</Label>
                <Input id="invName" value={invName} onChange={(e) => setInvName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{lang === "ar" ? "الدور" : "Role"}</Label>
                <Select value={invRole} onValueChange={(v) => setInvRole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                <Button type="submit" disabled={saving} className="gradient-primary text-primary-foreground">
                  {lang === "ar" ? "إرسال الدعوة" : "Send invite"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </SettingsLayout>
  );
}
