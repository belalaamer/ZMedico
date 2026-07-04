import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { Search, UserPlus, Trash2, Copy, KeyRound, AlertTriangle, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { useBranch } from "@/contexts/BranchContext";
import { Link2, Link2Off } from "lucide-react";
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

type StaffLink = { branch_id: string | null; employee_id: string | null };

async function logLinkAudit(
  action: "link" | "unlink" | "replace",
  userId: string,
  branchId: string | null,
  oldVals: Record<string, unknown> | null,
  newVals: Record<string, unknown> | null,
) {
  const { data: me } = await supabase.auth.getUser();
  await (supabase as any).from("audit_logs").insert({
    user_id: me.user?.id ?? null,
    branch_id: branchId,
    action,
    entity_type: "user_employee_link",
    entity_id: userId,
    old_values: oldVals,
    new_values: newVals,
  });
}

function suggestRoleFromPosition(titleEn: string | null | undefined, groupKey: string | null | undefined): Role {
  const s = `${titleEn ?? ""} ${groupKey ?? ""}`.toLowerCase();
  if (/(doctor|physician|طبيب|أطباء)/i.test(s)) return "doctor";
  if (/(nurse|ممرض)/i.test(s)) return "nurse";
  if (/(reception|استقبال)/i.test(s)) return "receptionist";
  if (/(account|محاسب)/i.test(s)) return "accountant";
  if (/(hr|human|موارد)/i.test(s)) return "hr";
  if (/(manager|مدير)/i.test(s)) return "manager";
  return "staff";
}

export default function UserManagement() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");
  const [invites, setInvites] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [staffLinks, setStaffLinks] = useState<Record<string, StaffLink>>({});
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
  // Linked employee state (for create-user flow)
  const [cLinkedStaffId, setCLinkedStaffId] = useState<string>("");
  const [linkableStaff, setLinkableStaff] = useState<any[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Reset-password dialog state
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [rPassword, setRPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetInfo, setResetInfo] = useState<{ email: string; password: string } | null>(null);
  // Edit-user dialog state
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [eRole, setERole] = useState<Role>("staff");
  const [eBranch, setEBranch] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<any | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const openEdit = (u: any) => {
    const current = (roles[u.id] ?? [])[0] as Role | undefined;
    setERole((current as Role) ?? "staff");
    setEBranch(staffLinks[u.id]?.branch_id ?? "");
    setEditTarget(u);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (eRole === "manager" && !eBranch) {
      toast.error(lang === "ar" ? "يجب اختيار فرع لدور المدير" : "Branch is required for the manager role");
      return;
    }
    setSavingEdit(true);
    const prev = staffLinks[editTarget.id] ?? null;
    const prevRole = (roles[editTarget.id] ?? [])[0] ?? null;
    // Replace roles: delete all then insert the chosen one
    const del = await (supabase as any).from("user_roles").delete().eq("user_id", editTarget.id);
    if (del.error) { setSavingEdit(false); toast.error(del.error.message); return; }
    const ins = await (supabase as any).from("user_roles").insert({ user_id: editTarget.id, role: eRole });
    if (ins.error) { setSavingEdit(false); toast.error(ins.error.message); return; }
    // Upsert staff_profiles branch. If no row exists yet, create one (post-creation linking).
    if (eBranch) {
      const existing = prev?.employee_id;
      let employeeId = existing ?? null;
      if (!employeeId) {
        // Generate an employee code so the NOT NULL constraint holds.
        const { data: counter } = await (supabase as any)
          .from("employee_id_counter").select("id,last_value").eq("id", 1).maybeSingle();
        const next = ((counter?.last_value as number) ?? 0) + 1;
        await (supabase as any).from("employee_id_counter").upsert({ id: 1, last_value: next });
        employeeId = `EMP-${String(next).padStart(4, "0")}`;
      }
      const { error: upErr } = await (supabase as any).from("staff_profiles")
        .upsert({ id: editTarget.id, branch_id: eBranch, employee_id: employeeId }, { onConflict: "id" });
      if (upErr) { setSavingEdit(false); toast.error(upErr.message); return; }
      const isLinkAction = !prev?.branch_id;
      await logLinkAudit(
        isLinkAction ? "link" : (prev?.branch_id !== eBranch ? "replace" : "link"),
        editTarget.id, eBranch,
        { role: prevRole, branch_id: prev?.branch_id ?? null },
        { role: eRole, branch_id: eBranch },
      );
    } else if (prevRole !== eRole) {
      await logLinkAudit("replace", editTarget.id, prev?.branch_id ?? null,
        { role: prevRole }, { role: eRole });
    }
    setSavingEdit(false);
    toast.success(lang === "ar" ? "تم تحديث الصلاحيات" : "Permissions updated");
    setEditTarget(null);
    load();
  };

  const unlinkEmployee = async () => {
    if (!unlinkTarget) return;
    setUnlinking(true);
    const prev = staffLinks[unlinkTarget.id] ?? null;
    // Soft-delete staff_profile and revoke roles (least-privilege).
    const { error: sErr } = await (supabase as any).from("staff_profiles")
      .update({ deleted_at: new Date().toISOString(), status: "terminated" })
      .eq("id", unlinkTarget.id);
    if (sErr) { setUnlinking(false); toast.error(sErr.message); return; }
    await (supabase as any).from("user_roles").delete().eq("user_id", unlinkTarget.id);
    await logLinkAudit("unlink", unlinkTarget.id, prev?.branch_id ?? null,
      { branch_id: prev?.branch_id ?? null, employee_id: prev?.employee_id ?? null }, null);
    setUnlinking(false);
    toast.success(lang === "ar" ? "تم فك الربط" : "Unlinked");
    setUnlinkTarget(null);
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
      .select("id,branch_id,employee_id,deleted_at");
    setUsers(ps ?? []);
    const m: Record<string, string[]> = {};
    (rs ?? []).forEach((r: any) => { (m[r.user_id] = m[r.user_id] || []).push(r.role); });
    setRoles(m);
    setInvites(inv ?? []);
    setBranches(brs ?? []);
    const sb: Record<string, StaffLink> = {};
    (sps ?? []).forEach((s: any) => {
      if (s.deleted_at) return; // treat soft-deleted as unlinked
      sb[s.id] = { branch_id: s.branch_id ?? null, employee_id: s.employee_id ?? null };
    });
    setStaffLinks(sb);
  };
  useEffect(() => { load(); }, []);

  // Load employees in the current branch that don't yet have any user role assigned.
  // Loaded on branch/data change so the picker (and the "link" flow from any surface)
  // always reflects the active branch — not only when the Create dialog opens.
  useEffect(() => {
    if (!currentBranchId) { setLinkableStaff([]); return; }
    (async () => {
      const { data: sps } = await (supabase as any)
        .from("staff_profiles")
        .select("id,employee_id,branch_id,position_id,staff_positions(title_en,title_ar,group_key),profiles!inner(email,full_name)")
        .eq("branch_id", currentBranchId)
        .is("deleted_at", null);
      const { data: rs } = await (supabase as any).from("user_roles").select("user_id");
      const withRoles = new Set((rs ?? []).map((r: any) => r.user_id));
      setLinkableStaff((sps ?? []).filter((s: any) => !withRoles.has(s.id)));
    })();
  }, [currentBranchId, users.length]);

  const onPickLinkedStaff = (id: string) => {
    setCLinkedStaffId(id);
    if (id === "none") {
      return;
    }
    const s = linkableStaff.find((x) => x.id === id);
    if (!s) return;
    setCEmail(s.profiles?.email ?? "");
    setCName(s.profiles?.full_name ?? "");
    setCBranch(s.branch_id ?? "");
    setCRole(suggestRoleFromPosition(s.staff_positions?.title_en, s.staff_positions?.group_key));
  };

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
    // Linked-employee path: the auth user already exists (profile row is
    // present). Assign the role + branch instead of creating a new account.
    if (cLinkedStaffId && cLinkedStaffId !== "none") {
      setCreating(true);
      const staff = linkableStaff.find((x) => x.id === cLinkedStaffId);
      if (!staff) { setCreating(false); toast.error("Staff not found"); return; }
      const del = await (supabase as any).from("user_roles").delete().eq("user_id", staff.id);
      if (del.error) { setCreating(false); toast.error(del.error.message); return; }
      const ins = await (supabase as any).from("user_roles").insert({ user_id: staff.id, role: cRole });
      if (ins.error) { setCreating(false); toast.error(ins.error.message); return; }
      if (cBranch) {
        await (supabase as any).from("staff_profiles").update({ branch_id: cBranch }).eq("id", staff.id);
      }
      setCreating(false);
      toast.success(lang === "ar" ? "تم ربط المستخدم بالموظف" : "User linked to employee");
      setCEmail(""); setCName(""); setCRole("staff"); setCPassword(""); setCBranch(""); setCLinkedStaffId("");
      setCreateOpen(false);
      load();
      return;
    }
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
      let msg = (data as any)?.error ?? error?.message ?? "Failed";
      try {
        const ctx: any = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          if (body?.error) msg = body.error;
        }
      } catch {}
      toast.error(msg);
      return; // keep modal open on failure
    }
    const info = data as { email: string; password: string };
    setCreatedInfo({ email: info.email, password: info.password });
    setCEmail(""); setCName(""); setCRole("staff"); setCPassword(""); setCBranch(""); setCLinkedStaffId("");
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

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (rPassword && rPassword.length < 6) {
      toast.error(lang === "ar" ? "كلمة المرور يجب أن تكون 6 أحرف على الأقل" : "Password must be at least 6 characters");
      return;
    }
    setResetting(true);
    const { data, error } = await supabase.functions.invoke("admin-reset-password", {
      body: { user_id: resetTarget.id, password: rPassword || undefined },
    });
    setResetting(false);
    if (error || (data as any)?.error) {
      let msg = (data as any)?.error ?? error?.message ?? "Failed";
      try {
        const ctx: any = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          if (body?.error) msg = body.error;
        }
      } catch {}
      toast.error(msg);
      return;
    }
    const info = data as { email: string; password: string };
    setResetInfo({ email: info.email ?? resetTarget.email, password: info.password });
    setRPassword("");
    setResetTarget(null);
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
                {staffLinks[u.id]?.branch_id ? (
                  <Badge variant="outline" className="gap-1 text-primary">
                    <Link2 className="size-3" />
                    {lang === "ar" ? "مربوط" : "Linked"}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    {lang === "ar" ? "غير مربوط" : "Unlinked"}
                  </Badge>
                )}
                {(roles[u.id] ?? []).includes("manager") && !staffLinks[u.id]?.branch_id && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="size-3" />
                    {lang === "ar" ? "بدون فرع" : "No branch"}
                  </Badge>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => openEdit(u)}>{t("edit")}</Button>
              {!staffLinks[u.id]?.branch_id && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-primary"
                  title={lang === "ar" ? "ربط بسجل موظف (اختر فرعاً)" : "Link to employee record (pick a branch)"}
                  onClick={() => openEdit(u)}
                >
                  <Link2 className="me-1 size-4" />
                  {lang === "ar" ? "ربط" : "Link"}
                </Button>
              )}
              {staffLinks[u.id]?.branch_id && currentUserId !== u.id && (
                <Button
                  size="sm"
                  variant="outline"
                  title={lang === "ar" ? "فك الربط بسجل الموظف" : "Unlink from employee record"}
                  onClick={() => setUnlinkTarget(u)}
                >
                  <Link2Off className="size-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                title={lang === "ar" ? "إعادة تعيين كلمة المرور" : "Reset password"}
                onClick={() => { setRPassword(""); setResetTarget(u); }}
              >
                <Lock className="size-4" />
              </Button>
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
              <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                <Label>
                  {lang === "ar" ? "ربط بموظف موجود (اختياري)" : "Link to existing employee (optional)"}
                </Label>
                <Select value={cLinkedStaffId || "none"} onValueChange={onPickLinkedStaff}>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === "ar" ? "اختر موظفاً من هذا الفرع" : "Pick an employee from this branch"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— {lang === "ar" ? "بدون ربط" : "No link"} —</SelectItem>
                    {linkableStaff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {(s.profiles?.full_name ?? s.profiles?.email ?? s.employee_id)}
                        {s.staff_positions ? ` — ${lang === "ar" ? s.staff_positions.title_ar : s.staff_positions.title_en}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {linkableStaff.length === 0
                      ? (lang === "ar" ? "لا يوجد موظفون غير مربوطين في هذا الفرع." : "No unlinked employees in this branch.")
                      : (lang === "ar" ? "سيتم الاقتراح التلقائي للدور بناءً على المسمى الوظيفي." : "Role will be suggested from the employee's position.")}
                  </span>
                  <Link to="/hr/staff" className="underline text-primary">
                    {lang === "ar" ? "إنشاء موظف" : "Create employee"}
                  </Link>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cEmail">{lang === "ar" ? "البريد الإلكتروني" : "Email"}</Label>
                <Input id="cEmail" type="email" required value={cEmail} onChange={(e) => setCEmail(e.target.value)} readOnly={!!cLinkedStaffId && cLinkedStaffId !== "none"} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cName">{lang === "ar" ? "الاسم الكامل" : "Full name"}</Label>
                <Input id="cName" value={cName} onChange={(e) => setCName(e.target.value)} readOnly={!!cLinkedStaffId && cLinkedStaffId !== "none"} />
              </div>
              <div className="space-y-2">
                <Label>
                  {lang === "ar" ? "الدور" : "Role"}
                  {cLinkedStaffId && cLinkedStaffId !== "none" && (
                    <span className="ms-2 text-xs text-muted-foreground">
                      {lang === "ar" ? "(مقترح — يمكن تغييره)" : "(suggested — you can change it)"}
                    </span>
                  )}
                </Label>
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
              {(!cLinkedStaffId || cLinkedStaffId === "none") && (
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
              )}
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

        {/* Unlink employee confirmation */}
        <AlertDialog open={!!unlinkTarget} onOpenChange={(o) => !o && !unlinking && setUnlinkTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {lang === "ar" ? "فك ربط سجل الموظف؟" : "Unlink employee record?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {lang === "ar"
                  ? `سيتم فك ربط ${unlinkTarget?.full_name ?? unlinkTarget?.email} من سجل الموظف وإزالة كل الأدوار. يظل حساب المستخدم موجوداً ولكن بلا صلاحيات.`
                  : `${unlinkTarget?.full_name ?? unlinkTarget?.email} will be unlinked from their employee record and all roles removed. The user account remains but will have no access.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={unlinking}>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={unlinkEmployee}
                disabled={unlinking}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {unlinking ? (lang === "ar" ? "جارٍ فك الربط..." : "Unlinking...") : (lang === "ar" ? "فك الربط" : "Unlink")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reset password dialog */}
        <Dialog open={!!resetTarget} onOpenChange={(o) => !o && !resetting && setResetTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {lang === "ar" ? "إعادة تعيين كلمة المرور" : "Reset password"}
              </DialogTitle>
              <DialogDescription>
                {resetTarget?.full_name ?? resetTarget?.email}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={resetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rPassword">
                  {lang === "ar" ? "كلمة مرور جديدة (اختياري)" : "New password (optional)"}
                </Label>
                <Input
                  id="rPassword"
                  type="text"
                  placeholder={lang === "ar" ? "اتركه فارغاً لتوليد كلمة مرور" : "Leave empty to auto-generate"}
                  value={rPassword}
                  onChange={(e) => setRPassword(e.target.value)}
                  minLength={6}
                />
                <p className="text-xs text-muted-foreground">
                  {lang === "ar" ? "الحد الأدنى 6 أحرف" : "Minimum 6 characters"}
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setResetTarget(null)} disabled={resetting}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={resetting} className="gradient-primary text-primary-foreground">
                  {resetting
                    ? (lang === "ar" ? "جارٍ التعيين..." : "Resetting...")
                    : (lang === "ar" ? "إعادة تعيين" : "Reset")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Reset result dialog */}
        <Dialog open={!!resetInfo} onOpenChange={(o) => !o && setResetInfo(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{lang === "ar" ? "تم تحديث كلمة المرور" : "Password updated"}</DialogTitle>
              <DialogDescription>
                {lang === "ar"
                  ? "احفظ كلمة المرور الجديدة الآن. لن تظهر مجدداً."
                  : "Save the new password now. It will not be shown again."}
              </DialogDescription>
            </DialogHeader>
            {resetInfo && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>{lang === "ar" ? "البريد" : "Email"}</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={resetInfo.email} />
                    <Button type="button" variant="outline" size="icon" onClick={() => copy(resetInfo.email)}>
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{lang === "ar" ? "كلمة المرور" : "Password"}</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={resetInfo.password} className="font-mono" />
                    <Button type="button" variant="outline" size="icon" onClick={() => copy(resetInfo.password)}>
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => copy(`${lang === "ar" ? "البريد" : "Email"}: ${resetInfo.email}\n${lang === "ar" ? "كلمة المرور" : "Password"}: ${resetInfo.password}`)}
                >
                  <Copy className="me-2 size-4" />
                  {lang === "ar" ? "نسخ بيانات الدخول" : "Copy credentials"}
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setResetInfo(null)} className="gradient-primary text-primary-foreground">
                {lang === "ar" ? "تم" : "Done"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SettingsLayout>
  );
}

