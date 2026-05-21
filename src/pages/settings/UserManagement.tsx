import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { Search, UserPlus, Trash2, Copy, KeyRound, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const ROLES = ["admin", "manager", "doctor", "nurse", "receptionist", "accountant", "hr", "staff"] as const;
type Role = typeof ROLES[number];

export default function UserManagement() {
  const { t, lang } = useI18n();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");
  const [invites, setInvites] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [staffBranches, setStaffBranches] = useState<Record<string, string | null>>({});
  const [open, setOpen] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invRole, setInvRole] = useState<Role>("staff");
  const [invBranch, setInvBranch] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Create-user dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [cEmail, setCEmail] = useState("");
  const [cName, setCName] = useState("");
  const [cRole, setCRole] = useState<Role>("staff");
  const [cPassword, setCPassword] = useState("");
  const [cBranch, setCBranch] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Edit-user dialog state
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [eRole, setERole] = useState<Role>("staff");
  const [eBranch, setEBranch] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (u: any) => {
    const current = (roles[u.id] ?? [])[0] as Role | undefined;
    setERole((current as Role) ?? "staff");
    setEBranch(staffBranches[u.id] ?? "");
    setEditTarget(u);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (eRole === "manager" && !eBranch) {
      toast.error(lang === "ar" ? "يجب اختيار فرع لدور المدير" : "Branch is required for the manager role");
      return;
    }
    setSavingEdit(true);
    // Replace roles: delete all then insert the chosen one
    const del = await (supabase as any).from("user_roles").delete().eq("user_id", editTarget.id);
    if (del.error) { setSavingEdit(false); toast.error(del.error.message); return; }
    const ins = await (supabase as any).from("user_roles").insert({ user_id: editTarget.id, role: eRole });
    if (ins.error) { setSavingEdit(false); toast.error(ins.error.message); return; }
    // Update staff_profiles branch if row exists
    if (eBranch) {
      await (supabase as any).from("staff_profiles").update({ branch_id: eBranch }).eq("id", editTarget.id);
    }
    setSavingEdit(false);
    toast.success(lang === "ar" ? "تم تحديث الصلاحيات" : "Permissions updated");
    setEditTarget(null);
    load();
  };

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const load = async () => {
    const { data: ps } = await supabase.from("profiles").select("*");
    const { data: rs } = await (supabase as any).from("user_roles").select("user_id,role");
    const { data: inv } = await (supabase as any)
      .from("allowed_signup_emails")
      .select("id,email,role,full_name,created_at")
      .order("created_at", { ascending: false });
    const { data: brs } = await (supabase as any)
      .from("branches")
      .select("id,name_en,name_ar")
      .eq("is_active", true)
      .order("name_en");
    const { data: sps } = await (supabase as any)
      .from("staff_profiles")
      .select("id,branch_id");
    setUsers(ps ?? []);
    const m: Record<string, string[]> = {};
    (rs ?? []).forEach((r: any) => { (m[r.user_id] = m[r.user_id] || []).push(r.role); });
    setRoles(m);
    setInvites(inv ?? []);
    setBranches(brs ?? []);
    const sb: Record<string, string | null> = {};
    (sps ?? []).forEach((s: any) => { sb[s.id] = s.branch_id ?? null; });
    setStaffBranches(sb);
  };
  useEffect(() => { load(); }, []);

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = invEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error(lang === "ar" ? "أدخل بريداً صالحاً" : "Enter a valid email");
      return;
    }
    if (invRole === "manager" && !invBranch) {
      toast.error(lang === "ar" ? "يجب اختيار فرع لدور المدير" : "Branch is required for the manager role");
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
    setInvEmail(""); setInvName(""); setInvRole("staff"); setInvBranch(""); setOpen(false);
    load();
  };

  const revokeInvite = async (id: string) => {
    const { error } = await (supabase as any).from("allowed_signup_emails").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم إلغاء الدعوة" : "Invite revoked");
    load();
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = cEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error(lang === "ar" ? "أدخل بريداً صالحاً" : "Enter a valid email");
      return;
    }
    setCreating(true);
    if (cRole === "manager" && !cBranch) {
      setCreating(false);
      toast.error(lang === "ar" ? "يجب اختيار فرع لدور المدير" : "Branch is required for the manager role");
      return;
    }
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email,
        full_name: cName.trim() || null,
        role: cRole,
        password: cPassword.trim() || undefined,
        branch_id: cBranch || undefined,
      },
    });
    setCreating(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed");
      return;
    }
    const info = data as { email: string; password: string };
    setCreatedInfo({ email: info.email, password: info.password });
    setCEmail(""); setCName(""); setCRole("staff"); setCPassword(""); setCBranch("");
    setCreateOpen(false);
    load();
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(lang === "ar" ? "تم النسخ" : "Copied");
    } catch {
      toast.error(lang === "ar" ? "تعذر النسخ" : "Copy failed");
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: deleteTarget.id },
    });
    setDeleting(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed");
      return;
    }
    toast.success(lang === "ar" ? "تم حذف المستخدم" : "User deleted");
    setDeleteTarget(null);
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
            <Button onClick={() => setCreateOpen(true)} variant="outline">
              <KeyRound className="me-2 size-4" />
              {lang === "ar" ? "إنشاء مستخدم" : "Create user"}
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
              <div className="flex gap-1 flex-wrap items-center">
                {(roles[u.id] ?? []).map(r => <Badge key={r} variant="outline" className="capitalize">{r}</Badge>)}
                {(roles[u.id] ?? []).includes("manager") && !staffBranches[u.id] && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="size-3" />
                    {lang === "ar" ? "بدون فرع" : "No branch"}
                  </Badge>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => openEdit(u)}>{t("edit")}</Button>
              {currentUserId !== u.id && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(u)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
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
              {invRole === "manager" && (
                <div className="space-y-2">
                  <Label>
                    {lang === "ar" ? "الفرع (مطلوب للمدير)" : "Branch (required for manager)"}
                  </Label>
                  <Select value={invBranch} onValueChange={setInvBranch}>
                    <SelectTrigger><SelectValue placeholder={lang === "ar" ? "اختر فرعاً" : "Select a branch"} /></SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {lang === "ar" ? b.name_ar : b.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {lang === "ar"
                      ? "ملاحظة: عند الدعوة، تأكد من تعيين الفرع للمدير في ملف الموظف بعد التسجيل."
                      : "Note: After invited user signs up, assign the branch in their staff profile."}
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                <Button type="submit" disabled={saving} className="gradient-primary text-primary-foreground">
                  {lang === "ar" ? "إرسال الدعوة" : "Send invite"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Create user dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{lang === "ar" ? "إنشاء مستخدم جديد" : "Create a new user"}</DialogTitle>
              <DialogDescription>
                {lang === "ar"
                  ? "سيتم إنشاء الحساب فوراً بكلمة مرور مؤقتة. شارك بيانات الدخول مع المستخدم."
                  : "The account will be created immediately with a temporary password. Share the credentials with the user."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={createUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cEmail">{lang === "ar" ? "البريد الإلكتروني" : "Email"}</Label>
                <Input id="cEmail" type="email" required value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cName">{lang === "ar" ? "الاسم الكامل" : "Full name"}</Label>
                <Input id="cName" value={cName} onChange={(e) => setCName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{lang === "ar" ? "الدور" : "Role"}</Label>
                <Select value={cRole} onValueChange={(v) => setCRole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {cRole === "manager" && (
                <div className="space-y-2">
                  <Label>
                    {lang === "ar" ? "الفرع (مطلوب للمدير)" : "Branch (required for manager)"}
                  </Label>
                  <Select value={cBranch} onValueChange={setCBranch}>
                    <SelectTrigger><SelectValue placeholder={lang === "ar" ? "اختر فرعاً" : "Select a branch"} /></SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {lang === "ar" ? b.name_ar : b.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="cPassword">
                  {lang === "ar" ? "كلمة مرور (اختياري)" : "Password (optional)"}
                </Label>
                <Input
                  id="cPassword"
                  type="text"
                  placeholder={lang === "ar" ? "اتركه فارغاً لتوليد كلمة مرور" : "Leave empty to auto-generate"}
                  value={cPassword}
                  onChange={(e) => setCPassword(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("cancel")}</Button>
                <Button type="submit" disabled={creating} className="gradient-primary text-primary-foreground">
                  {creating
                    ? (lang === "ar" ? "جارٍ الإنشاء..." : "Creating...")
                    : (lang === "ar" ? "إنشاء" : "Create")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Created credentials dialog */}
        <Dialog open={!!createdInfo} onOpenChange={(o) => !o && setCreatedInfo(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{lang === "ar" ? "تم إنشاء المستخدم" : "User created"}</DialogTitle>
              <DialogDescription>
                {lang === "ar"
                  ? "احفظ كلمة المرور المؤقتة الآن. لن تظهر مجدداً."
                  : "Save the temporary password now. It will not be shown again."}
              </DialogDescription>
            </DialogHeader>
            {createdInfo && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>{lang === "ar" ? "البريد" : "Email"}</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={createdInfo.email} />
                    <Button type="button" variant="outline" size="icon" onClick={() => copy(createdInfo.email)}>
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{lang === "ar" ? "كلمة المرور المؤقتة" : "Temporary password"}</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={createdInfo.password} className="font-mono" />
                    <Button type="button" variant="outline" size="icon" onClick={() => copy(createdInfo.password)}>
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => copy(`${lang === "ar" ? "البريد" : "Email"}: ${createdInfo.email}\n${lang === "ar" ? "كلمة المرور" : "Password"}: ${createdInfo.password}`)}
                >
                  <Copy className="me-2 size-4" />
                  {lang === "ar" ? "نسخ بيانات الدخول" : "Copy credentials"}
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setCreatedInfo(null)} className="gradient-primary text-primary-foreground">
                {lang === "ar" ? "تم" : "Done"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {lang === "ar" ? "حذف المستخدم؟" : "Delete user?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {lang === "ar"
                  ? `سيتم حذف ${deleteTarget?.full_name ?? deleteTarget?.email} نهائياً مع كل الأدوار والصلاحيات. لا يمكن التراجع.`
                  : `${deleteTarget?.full_name ?? deleteTarget?.email} will be permanently deleted with all roles. This cannot be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteUser}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? (lang === "ar" ? "جارٍ الحذف..." : "Deleting...") : t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit user dialog */}
        <Dialog open={!!editTarget} onOpenChange={(o) => !o && !savingEdit && setEditTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {lang === "ar" ? "تعديل صلاحيات المستخدم" : "Edit user permissions"}
              </DialogTitle>
              <DialogDescription>
                {editTarget?.full_name ?? editTarget?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{lang === "ar" ? "الدور" : "Role"}</Label>
                <Select value={eRole} onValueChange={(v) => setERole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  {lang === "ar" ? "الفرع" : "Branch"}
                  {eRole === "manager" && (lang === "ar" ? " (مطلوب للمدير)" : " (required for manager)")}
                </Label>
                <Select value={eBranch} onValueChange={setEBranch}>
                  <SelectTrigger><SelectValue placeholder={lang === "ar" ? "اختر فرعاً" : "Select a branch"} /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {lang === "ar" ? b.name_ar : b.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={savingEdit}>
                {t("cancel")}
              </Button>
              <Button type="button" onClick={saveEdit} disabled={savingEdit} className="gradient-primary text-primary-foreground">
                {savingEdit ? (lang === "ar" ? "جارٍ الحفظ..." : "Saving...") : (lang === "ar" ? "حفظ" : "Save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SettingsLayout>
  );
}
