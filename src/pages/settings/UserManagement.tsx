import { useEffect, useMemo, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { Search, UserPlus, Trash2, Copy, KeyRound, AlertTriangle, Lock, Users, MoreHorizontal, Pencil, Info, X } from "lucide-react";
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListSkeleton } from "@/components/ListSkeleton";
import { TablePager } from "@/components/TablePager";
import { toast } from "sonner";

const ROLES = ["system_owner", "admin", "manager", "doctor", "nurse", "receptionist", "accountant", "hr"] as const;
type Role = typeof ROLES[number];

type StaffLink = { branch_id: string | null; employee_id: string | null };

// M2 Settings cutover: identity/role writes go through the
// settings_assign_user_role SECURITY DEFINER RPC, which performs the
// role delete/insert, optional staff_profiles branch upsert, employee_id
// generation, and audit_logs write inside a single transaction. The
// legacy client-side audit helper was removed with those writes.
async function assignUserRole(
  targetUserId: string,
  newRole: Role | null,
  branchId: string | null,
): Promise<{ error: { message: string } | null }> {
  const { error } = await (supabase as any).rpc("settings_assign_user_role", {
    _target_user_id: targetUserId,
    _new_role: newRole,
    _branch_id: branchId,
  });
  return { error: error ? { message: error.message } : null };
}

function suggestRoleFromPosition(titleEn: string | null | undefined, groupKey: string | null | undefined): Role {
  const s = `${titleEn ?? ""} ${groupKey ?? ""}`.toLowerCase();
  if (/(doctor|physician|طبيب|أطباء)/i.test(s)) return "doctor";
  if (/(nurse|ممرض)/i.test(s)) return "nurse";
  if (/(reception|استقبال)/i.test(s)) return "receptionist";
  if (/(account|محاسب)/i.test(s)) return "accountant";
  if (/(hr|human|موارد)/i.test(s)) return "hr";
  if (/(manager|مدير)/i.test(s)) return "manager";
  return "doctor";
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
  const [invRole, setInvRole] = useState<Role>("doctor");
  const [invBranch, setInvBranch] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Create-user dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [cEmail, setCEmail] = useState("");
  const [cName, setCName] = useState("");
  const [cRole, setCRole] = useState<Role>("doctor");
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
  const [eRole, setERole] = useState<Role>("doctor");
  const [eBranch, setEBranch] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<any | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  // Link / Replace picker state
  const [linkTarget, setLinkTarget] = useState<any | null>(null); // user we're linking
  const [linkMode, setLinkMode] = useState<"link" | "replace">("link");
  const [pickerStaff, setPickerStaff] = useState<any[]>([]);
  const [pickedStaffId, setPickedStaffId] = useState<string>("");
  const [pickedRole, setPickedRole] = useState<Role>("doctor");
  const [linking, setLinking] = useState(false);

  // UI-only local state for the enterprise table view.
  const [isLoading, setIsLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const openLinkPicker = async (u: any, mode: "link" | "replace") => {
    setLinkTarget(u);
    setLinkMode(mode);
    setPickedStaffId("");
    setPickedRole(((roles[u.id] ?? [])[0] as Role) ?? "doctor");
    if (!currentBranchId) { setPickerStaff([]); return; }
    const { data: sps } = await (supabase as any)
      .from("staff_profiles")
      .select("id,employee_id,branch_id,linked_user_id,staff_positions(title_en,title_ar),profiles(email,full_name)")
      .eq("branch_id", currentBranchId)
      .is("deleted_at", null);
    setPickerStaff(sps ?? []);
  };

  const confirmLink = async () => {
    if (!linkTarget || !pickedStaffId) return;
    const target = pickerStaff.find((s) => s.id === pickedStaffId);
    if (!target) return;
    if (target.linked_user_id) {
      toast.error(lang === "ar" ? "هذا الموظف مربوط بالفعل" : "This employee is already linked");
      return;
    }
    if (currentBranchId && target.branch_id && target.branch_id !== currentBranchId) {
      toast.error(lang === "ar" ? "لا يمكن الربط عبر فرع مختلف" : "Cross-branch link is not allowed");
      return;
    }
    setLinking(true);
    try {
      const prevStaffId = Object.entries(staffLinks).find(([, v]) => (v as any).linked_user_id === linkTarget.id)?.[0]
        ?? (staffLinks[linkTarget.id]?.branch_id ? linkTarget.id : null);
      // Replace: clear previous link atomically-ish
      if (linkMode === "replace" && prevStaffId) {
        const { error } = await (supabase as any).from("staff_profiles")
          .update({ linked_user_id: null })
          .eq("id", prevStaffId)
          .eq("linked_user_id", linkTarget.id);
        if (error) throw error;
      }
      // Guarded link: only succeeds if target is still unlinked
      const { data: upd, error: upErr } = await (supabase as any).from("staff_profiles")
        .update({ linked_user_id: linkTarget.id })
        .eq("id", pickedStaffId)
        .is("linked_user_id", null)
        .select("id");
      if (upErr) throw upErr;
      if (!upd || upd.length === 0) {
        // Rollback replace if we cleared previous
        if (linkMode === "replace" && prevStaffId) {
          await (supabase as any).from("staff_profiles")
            .update({ linked_user_id: linkTarget.id })
            .eq("id", prevStaffId);
        }
        throw new Error(lang === "ar" ? "الموظف مربوط بالفعل — أعد التحميل" : "Employee is already linked — refresh");
      }
      // Role assignment via the atomic Settings RPC (writes its own audit).
      const r = await assignUserRole(linkTarget.id, pickedRole, null);
      if (r.error) throw new Error(r.error.message);
      toast.success(lang === "ar" ? "تم الربط" : "Linked");
      setLinkTarget(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setLinking(false);
    }
  };

  const openEdit = (u: any) => {
    const current = (roles[u.id] ?? [])[0] as Role | undefined;
    setERole((current as Role) ?? "doctor");
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
    // Atomic: role + optional branch/employee upsert + audit in one call.
    const r = await assignUserRole(editTarget.id, eRole, eBranch || null);
    setSavingEdit(false);
    if (r.error) { toast.error(r.error.message); return; }
    toast.success(lang === "ar" ? "تم تحديث الصلاحيات" : "Permissions updated");
    setEditTarget(null);
    load();
  };

  const unlinkEmployee = async () => {
    if (!unlinkTarget) return;
    setUnlinking(true);
    // Direct link clear stays under RLS (staff_profiles admin policy).
    const { error: sErr } = await (supabase as any).from("staff_profiles")
      .update({ linked_user_id: null })
      .eq("linked_user_id", unlinkTarget.id);
    if (sErr) { setUnlinking(false); toast.error(sErr.message); return; }
    // Role clear + audit via the atomic RPC.
    const r = await assignUserRole(unlinkTarget.id, null, null);
    if (r.error) { setUnlinking(false); toast.error(r.error.message); return; }
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
    // Only the identity fields are rendered / edited on this screen.
    const { data: ps } = await supabase.from("profiles").select("id,full_name,email");
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
      .select("id,branch_id,employee_id,deleted_at,linked_user_id");
    setUsers(ps ?? []);
    const m: Record<string, string[]> = {};
    (rs ?? []).forEach((r: any) => { (m[r.user_id] = m[r.user_id] || []).push(r.role); });
    setRoles(m);
    setInvites(inv ?? []);
    setBranches(brs ?? []);
    const sb: Record<string, StaffLink> = {};
    (sps ?? []).forEach((s: any) => {
      if (s.deleted_at) return; // treat soft-deleted as unlinked
      // Key by the user this staff row is linked to (falls back to id for
      // legacy rows). This lets us render "linked" state on the user row.
      const key = s.linked_user_id ?? s.id;
      sb[key] = { branch_id: s.branch_id ?? null, employee_id: s.employee_id ?? null } as StaffLink;
    });
    setStaffLinks(sb);
    setIsLoading(false);
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
    setInvEmail(""); setInvName(""); setInvRole("doctor"); setInvBranch(""); setOpen(false);
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
      const r = await assignUserRole(staff.id, cRole, cBranch || null);
      if (r.error) { setCreating(false); toast.error(r.error.message); return; }
      setCreating(false);
      toast.success(lang === "ar" ? "تم ربط المستخدم بالموظف" : "User linked to employee");
      setCEmail(""); setCName(""); setCRole("doctor"); setCPassword(""); setCBranch(""); setCLinkedStaffId("");
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
    const info = data as { email: string; password?: string; action_link?: string };
    if (!info.password) {
      toast.error(
        info.action_link
          ? (lang === "ar" ? "تم إنشاء رابط تعيين كلمة مرور بدلاً من كلمة مرور مباشرة. استخدم إعادة التعيين إذا لزم." : "A password setup link was created instead of a direct password. Use reset if needed.")
          : (lang === "ar" ? "لم يرجع الخادم كلمة مرور للمستخدم الجديد." : "The server did not return a password for the new user."),
      );
      await load();
      return;
    }
    setCreatedInfo({ email: info.email, password: info.password });
    setCEmail(""); setCName(""); setCRole("doctor"); setCPassword(""); setCBranch(""); setCLinkedStaffId("");
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
    const info = data as { email: string; password?: string; action_link?: string };
    if (!info.password) {
      toast.error(
        info.action_link
          ? (lang === "ar" ? "تم إنشاء رابط استرداد بدلاً من كلمة مرور مباشرة." : "A recovery link was created instead of a direct password.")
          : (lang === "ar" ? "لم يرجع الخادم كلمة مرور جديدة." : "The server did not return a new password."),
      );
      return;
    }
    setResetInfo({ email: info.email ?? resetTarget.email, password: info.password });
    setRPassword("");
    setResetTarget(null);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (needle) {
        const hay = `${u.full_name ?? ""} ${u.email ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (roleFilter !== "all") {
        const rs = roles[u.id] ?? [];
        if (!rs.includes(roleFilter)) return false;
      }
      if (linkFilter !== "all") {
        const linked = !!staffLinks[u.id]?.branch_id;
        if (linkFilter === "linked" && !linked) return false;
        if (linkFilter === "unlinked" && linked) return false;
      }
      return true;
    });
  }, [users, roles, staffLinks, q, roleFilter, linkFilter]);

  useEffect(() => { setPage(0); }, [q, roleFilter, linkFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{t("userManagement")}</h1>
          <div className="flex items-center gap-2 flex-wrap">
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

        <Card className="p-3 shadow-sm bg-muted/30">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input className="ps-9 bg-background" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder={lang === "ar" ? "الدور" : "Role"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === "ar" ? "كل الأدوار" : "All roles"}</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={linkFilter} onValueChange={(v) => setLinkFilter(v as any)}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder={lang === "ar" ? "الربط" : "Link status"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === "ar" ? "الكل" : "All"}</SelectItem>
                <SelectItem value="linked">{lang === "ar" ? "مربوط" : "Linked"}</SelectItem>
                <SelectItem value="unlinked">{lang === "ar" ? "غير مربوط" : "Unlinked"}</SelectItem>
              </SelectContent>
            </Select>
            <div className="ms-auto flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums px-2 py-1 rounded-md bg-background border border-border">
              <Users className="size-3.5" />
              <span className="font-semibold text-foreground">{filtered.length}</span>
              <span>{lang === "ar" ? "مستخدم" : "users"}</span>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden shadow-card">
          {isLoading ? (
            <ListSkeleton rows={6} />
          ) : (
            <>
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
                  <TableRow>
                    <TableHead className="uppercase tracking-wider text-xs">{lang === "ar" ? "المستخدم" : "User"}</TableHead>
                    <TableHead className="uppercase tracking-wider text-xs">{lang === "ar" ? "الأدوار" : "Roles"}</TableHead>
                    <TableHead className="uppercase tracking-wider text-xs">{lang === "ar" ? "الربط / الفرع" : "Branch / Link"}</TableHead>
                    <TableHead className="w-[64px] text-end uppercase tracking-wider text-xs">{lang === "ar" ? "إجراءات" : "Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="p-10 text-center text-muted-foreground">
                        {t("noData")}
                      </TableCell>
                    </TableRow>
                  )}
                  {paged.map((u) => {
                    const userRoles = roles[u.id] ?? [];
                    const linked = !!staffLinks[u.id]?.branch_id;
                    const isSelf = currentUserId === u.id;
                    return (
                      <TableRow key={u.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="size-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/20 flex items-center justify-center font-bold shrink-0">
                              {(u.full_name ?? u.email ?? "?").slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold truncate text-foreground">{u.full_name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {userRoles.length === 0 && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                            {userRoles.map((r) => (
                              <Badge key={r} variant="outline" className="capitalize">{r}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 items-center">
                            {linked ? (
                              <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                <Link2 className="size-3" />
                                {lang === "ar" ? "مربوط" : "Linked"}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1 bg-muted text-muted-foreground">
                                {lang === "ar" ? "غير مربوط" : "Unlinked"}
                              </Badge>
                            )}
                            {userRoles.includes("manager") && !linked && (
                              <Badge variant="outline" className="gap-1 bg-warning/10 text-warning border-warning/30">
                                <AlertTriangle className="size-3" />
                                {lang === "ar" ? "بدون فرع" : "No branch"}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="actions">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(u)}>
                                <Pencil className="me-2 size-4" />
                                {t("edit")}
                              </DropdownMenuItem>
                              {!linked && (
                                <DropdownMenuItem onClick={() => openLinkPicker(u, "link")}>
                                  <Link2 className="me-2 size-4" />
                                  {lang === "ar" ? "ربط بموظف" : "Link to employee"}
                                </DropdownMenuItem>
                              )}
                              {linked && !isSelf && (
                                <>
                                  <DropdownMenuItem onClick={() => openLinkPicker(u, "replace")}>
                                    <Users className="me-2 size-4" />
                                    {lang === "ar" ? "استبدال الموظف" : "Replace employee"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setUnlinkTarget(u)}>
                                    <Link2Off className="me-2 size-4" />
                                    {lang === "ar" ? "فك الربط" : "Unlink"}
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setRPassword(""); setResetTarget(u); }}>
                                <Lock className="me-2 size-4" />
                                {lang === "ar" ? "إعادة تعيين كلمة المرور" : "Reset password"}
                              </DropdownMenuItem>
                              {!isSelf && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(u)}
                                >
                                  <Trash2 className="me-2 size-4" />
                                  {t("delete")}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <TablePager
                page={currentPage}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                onPageChange={setPage}
              />
            </>
          )}
        </Card>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            {lang === "ar" ? "الدعوات المعلقة" : "Pending invites"}
            {invites.length > 0 && (
              <Badge variant="secondary" className="ms-1">{invites.length}</Badge>
            )}
          </h2>
          <Card className="overflow-hidden shadow-card">
            <div className="divide-y divide-border">
              {invites.map((i) => (
                <div key={i.id} className="flex items-center gap-3 p-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                  <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0">
                    {(i.full_name ?? i.email ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{i.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{i.email}</div>
                  </div>
                  {i.role && <Badge variant="outline" className="capitalize">{i.role}</Badge>}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => revokeInvite(i.id)}
                    aria-label={lang === "ar" ? "إلغاء" : "Revoke"}
                    title={lang === "ar" ? "إلغاء الدعوة" : "Revoke invite"}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              {invites.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {lang === "ar" ? "لا توجد دعوات معلقة" : "No pending invites"}
                </div>
              )}
            </div>
          </Card>
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
              <div className="space-y-2 rounded-lg border border-primary/20 p-4 bg-primary/5">
                <Label className="flex items-center gap-2 text-primary">
                  <Info className="size-4" />
                  {lang === "ar" ? "ربط بموظف موجود (اختياري)" : "Link to existing employee (optional)"}
                </Label>
                <Select value={cLinkedStaffId || "none"} onValueChange={onPickLinkedStaff}>
                  <SelectTrigger className="bg-background">
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
        {/* Link picker dialog */}
        <Dialog open={!!linkTarget} onOpenChange={(o) => !o && !linking && setLinkTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {linkMode === "replace"
                  ? (lang === "ar" ? "استبدال الموظف المربوط" : "Replace linked employee")
                  : (lang === "ar" ? "ربط بموظف من الدليل" : "Link to an employee")}
              </DialogTitle>
              <DialogDescription>
                {linkTarget?.full_name ?? linkTarget?.email}
                {" — "}
                {lang === "ar"
                  ? "الموظفون المعروضون من الفرع الحالي فقط."
                  : "Only employees from the current branch are shown."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="max-h-72 overflow-auto rounded border divide-y">
                {pickerStaff.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {lang === "ar"
                      ? "لا يوجد موظفون في هذا الفرع."
                      : "No employees in this branch."}
                  </div>
                )}
                {pickerStaff.map((s) => {
                  const linkedElsewhere = !!s.linked_user_id && s.linked_user_id !== linkTarget?.id;
                  const isSelf = s.linked_user_id === linkTarget?.id;
                  const disabled = linkedElsewhere || isSelf;
                  const selected = pickedStaffId === s.id;
                  return (
                    <button
                      type="button"
                      key={s.id}
                      disabled={disabled}
                      onClick={() => !disabled && setPickedStaffId(s.id)}
                      className={`w-full text-start p-3 text-sm flex items-center gap-3 ${
                        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted"
                      } ${selected ? "bg-primary/10" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {s.profiles?.full_name ?? s.profiles?.email ?? s.employee_id}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {s.employee_id}
                          {s.staff_positions ? ` · ${lang === "ar" ? s.staff_positions.title_ar : s.staff_positions.title_en}` : ""}
                        </div>
                      </div>
                      {linkedElsewhere && (
                        <Badge variant="secondary">
                          {lang === "ar" ? "غير متاح — مربوط" : "Unavailable — already linked"}
                        </Badge>
                      )}
                      {isSelf && (
                        <Badge variant="outline">
                          {lang === "ar" ? "الحالي" : "Current"}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
              {pickerStaff.every((s) => s.linked_user_id && s.linked_user_id !== linkTarget?.id) && pickerStaff.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "كل الموظفين في هذا الفرع مربوطون بالفعل. أنشئ موظفاً جديداً من دليل الموظفين."
                    : "All employees in this branch are already linked. Create a new employee in the staff directory."}
                </p>
              )}
              <div className="space-y-2">
                <Label>{lang === "ar" ? "الدور" : "Role"}</Label>
                <Select value={pickedRole} onValueChange={(v) => setPickedRole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLinkTarget(null)} disabled={linking}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={confirmLink}
                disabled={linking || !pickedStaffId}
                className="gradient-primary text-primary-foreground"
              >
                {linking
                  ? (lang === "ar" ? "جارٍ..." : "Working...")
                  : (linkMode === "replace"
                      ? (lang === "ar" ? "استبدال" : "Replace")
                      : (lang === "ar" ? "ربط" : "Link"))}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

