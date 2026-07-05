import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, User, Link2Off, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDate } from "@/lib/format";
import { statusLabel } from "./Staff";
import StaffBranchesTab from "./StaffBranchesTab";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Can } from "@/components/Can";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useBranch } from "@/contexts/BranchContext";
import { useUserRole } from "@/hooks/useUserRole";

const DAYS = ["sun","mon","tue","wed","thu","fri","sat"] as const;

export default function StaffDetail() {
  const { t, lang } = useI18n();
  const { id } = useParams();
  const { currentBranchId } = useBranch();
  const { roles, isAdmin } = useUserRole();
  // Least-privilege UI mask: only admin + HR see salary / bank / national_id
  // / DOB / commission %. Applies even when a linked employee views their
  // own profile.
  const canSeeSensitive = isAdmin || roles.includes("hr");
  const MASK = "••••";
  const [staff, setStaff] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [position, setPosition] = useState<any>(null);
  const [dept, setDept] = useState<any>(null);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkedProfile, setLinkedProfile] = useState<any>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkMode, setLinkMode] = useState<"link" | "replace">("link");
  const [candidateUsers, setCandidateUsers] = useState<any[]>([]);
  const [pickedUserId, setPickedUserId] = useState<string>("");
  const [linking, setLinking] = useState(false);

  const reload = async () => {
    if (!id) return;
    const { data: s } = await supabase.from("staff_profiles").select("*").eq("id", id).maybeSingle();
    setStaff(s);
    const linkedUid = (s as any)?.linked_user_id ?? null;
    if (linkedUid) {
      const { data: lp } = await supabase.from("profiles").select("*").eq("id", linkedUid).maybeSingle();
      setLinkedProfile(lp);
      const { data: rs } = await (supabase as any).from("user_roles").select("role").eq("user_id", linkedUid);
      setUserRoles((rs ?? []).map((r: any) => r.role));
    } else {
      setLinkedProfile(null);
      setUserRoles([]);
    }
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: s } = await supabase.from("staff_profiles").select("*").eq("id", id).maybeSingle();
      setStaff(s);
      const { data: p } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
      setProfile(p);
      if (s?.position_id) { const { data } = await supabase.from("staff_positions").select("*").eq("id", s.position_id).maybeSingle(); setPosition(data); }
      if (s?.department_id) { const { data } = await supabase.from("departments").select("*").eq("id", s.department_id).maybeSingle(); setDept(data); }
      const { data: sch } = await supabase.from("work_schedules").select("*").eq("staff_id", id).order("day_of_week");
      setSchedule(sch ?? []);
      const { data: at } = await supabase.from("attendance").select("*").eq("staff_id", id).order("date", { ascending: false }).limit(60);
      setAttendance(at ?? []);
      const { data: lv } = await supabase.from("leave_requests").select("*, leave_type:leave_types(name_en,name_ar)").eq("staff_id", id).order("start_date", { ascending: false }).limit(50);
      setLeaves(lv ?? []);
      const { data: pr } = await supabase.from("payroll").select("*").eq("staff_id", id).order("period_year", { ascending: false }).order("period_month", { ascending: false }).limit(24);
      setPayroll(pr ?? []);
      const linkedUid = (s as any)?.linked_user_id ?? null;
      if (linkedUid) {
        const { data: lp } = await supabase.from("profiles").select("*").eq("id", linkedUid).maybeSingle();
        setLinkedProfile(lp);
        const { data: rs } = await (supabase as any).from("user_roles").select("role").eq("user_id", linkedUid);
        setUserRoles((rs ?? []).map((r: any) => r.role));
      }
    })();
  }, [id]);

  const unlinkUser = async () => {
    if (!id) return;
    setBusy(true);
    const { data: me } = await supabase.auth.getUser();
    const linkedUid = (staff as any)?.linked_user_id ?? null;
    const { error: sErr } = await (supabase as any).from("staff_profiles")
      .update({ linked_user_id: null }).eq("id", id);
    if (sErr) { setBusy(false); toast.error(sErr.message); return; }
    if (linkedUid) {
      await (supabase as any).from("user_roles").delete().eq("user_id", linkedUid);
    }
    await (supabase as any).from("audit_logs").insert({
      user_id: me.user?.id ?? null,
      branch_id: staff?.branch_id ?? null,
      action: "employee_unlinked",
      entity_type: "user_employee_link",
      entity_id: linkedUid ?? id,
      old_values: { branch_id: staff?.branch_id ?? null, employee_id: staff?.employee_id ?? null, roles: userRoles },
      new_values: null,
    });
    setBusy(false);
    setConfirmUnlink(false);
    toast.success(lang === "ar" ? "تم فك الربط" : "Unlinked");
    reload();
  };

  const openLinkPicker = async (mode: "link" | "replace") => {
    setLinkMode(mode);
    setPickedUserId("");
    // Load all user profiles, then exclude those already linked to another
    // active staff_profile (via linked_user_id).
    const { data: ps } = await supabase.from("profiles").select("id,email,full_name");
    const { data: linkedRows } = await (supabase as any)
      .from("staff_profiles").select("linked_user_id").not("linked_user_id","is",null).is("deleted_at", null);
    const takenIds = new Set((linkedRows ?? []).map((r: any) => r.linked_user_id));
    // Allow current linked user (for replace/current preview)
    if ((staff as any)?.linked_user_id) takenIds.delete((staff as any).linked_user_id);
    setCandidateUsers((ps ?? []).map((p: any) => ({ ...p, _taken: takenIds.has(p.id) })));
    setLinkOpen(true);
  };

  const confirmLink = async () => {
    if (!id || !pickedUserId) return;
    if (staff?.branch_id && currentBranchId && staff.branch_id !== currentBranchId) {
      toast.error(lang === "ar" ? "لا يمكن الربط عبر فرع مختلف" : "Cross-branch link is not allowed");
      return;
    }
    setLinking(true);
    try {
      const prevLinkedUid = (staff as any)?.linked_user_id ?? null;
      const { data: upd, error } = await (supabase as any).from("staff_profiles")
        .update({ linked_user_id: pickedUserId })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!upd || upd.length === 0) throw new Error("Link failed");
      // Revoke roles from previous linked user if replace
      if (linkMode === "replace" && prevLinkedUid && prevLinkedUid !== pickedUserId) {
        await (supabase as any).from("user_roles").delete().eq("user_id", prevLinkedUid);
      }
      const { data: me } = await supabase.auth.getUser();
      await (supabase as any).from("audit_logs").insert({
        user_id: me.user?.id ?? null,
        branch_id: staff?.branch_id ?? null,
        action: linkMode === "replace" ? "employee_replaced" : "employee_linked",
        entity_type: "user_employee_link",
        entity_id: pickedUserId,
        old_values: { staff_id: id, prev_linked_user_id: prevLinkedUid },
        new_values: { staff_id: id, linked_user_id: pickedUserId, branch_id: staff?.branch_id ?? null },
      });
      toast.success(lang === "ar" ? "تم الربط" : "Linked");
      setLinkOpen(false);
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setLinking(false);
    }
  };

  if (!staff) return <div className="p-10 text-center text-muted-foreground">…</div>;

  return (
    <div className="space-y-6">
      <Link to="/hr/staff" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {t("staffDirectory")}</Link>
      <Card className="p-5 shadow-card flex items-center gap-4">
        <div className="size-16 rounded-full bg-primary/10 text-primary flex items-center justify-center overflow-hidden">
          {staff.profile_image_url ? <img src={staff.profile_image_url} alt="" className="w-full h-full object-cover" /> : <User className="size-8" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xl font-bold">{profile?.full_name ?? profile?.email}</div>
          <div className="text-sm text-muted-foreground">{staff.employee_id} · {position ? (lang === "ar" ? position.title_ar : position.title_en) : "—"} · {dept ? (lang === "ar" ? dept.name_ar : dept.name_en) : "—"}</div>
        </div>
        <Badge variant="outline" className={staff.status === "active" ? "status-completed" : "status-departed"}>{statusLabel(staff.status, t)}</Badge>
      </Card>

      {/* User access / linkage */}
      <Card className="p-4 shadow-card flex items-center gap-3 flex-wrap">
        <Shield className="size-4 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">
            {lang === "ar" ? "وصول المستخدم" : "User access"}
          </div>
          <div className="text-xs text-muted-foreground flex gap-2 flex-wrap mt-1 items-center">
            {linkedProfile ? (
              <>
                <span className="font-medium text-foreground">
                  {linkedProfile.full_name ?? linkedProfile.email}
                </span>
                {userRoles.map((r) => <Badge key={r} variant="outline" className="capitalize">{r}</Badge>)}
              </>
            ) : (
              <span>{lang === "ar" ? "لا يوجد وصول — الموظف غير مربوط بحساب مستخدم." : "No access — employee is not linked to a user account."}</span>
            )}
          </div>
        </div>
        <Can module="settings" action="edit">
          {!linkedProfile && (
            <Button variant="outline" size="sm" onClick={() => openLinkPicker("link")}>
              {lang === "ar" ? "ربط بمستخدم" : "Link to user"}
            </Button>
          )}
          {linkedProfile && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/settings/users">{lang === "ar" ? "إدارة الوصول" : "Manage access"}</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => openLinkPicker("replace")}>
                {lang === "ar" ? "استبدال" : "Replace"}
              </Button>
              <Button variant="outline" size="sm" className="text-destructive"
                onClick={() => setConfirmUnlink(true)}>
                <Link2Off className="me-1 size-4" />
                {lang === "ar" ? "فك الربط" : "Unlink"}
              </Button>
            </>
          )}
        </Can>
      </Card>

      <Tabs defaultValue="info">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="info">{t("position")}</TabsTrigger>
          <TabsTrigger value="schedule">{t("schedule")}</TabsTrigger>
          <TabsTrigger value="attendance">{t("attendance")}</TabsTrigger>
          <TabsTrigger value="leaves">{t("leaves")}</TabsTrigger>
          <TabsTrigger value="payroll">{t("payroll")}</TabsTrigger>
          <TabsTrigger value="branches">{lang === "ar" ? "الفروع" : "Branches"}</TabsTrigger>
        </TabsList>
        <TabsContent value="info">
          <Card className="p-5 shadow-card grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Field label={t("hireDate")}>{formatDate(staff.hire_date, lang)}</Field>
            <Field label={t("contractType")}>{staff.contract_type}</Field>
            <Field label={t("salary")}>{canSeeSensitive ? formatMoney(staff.salary, lang, staff.salary_currency) : MASK}</Field>
            <Field label={t("commissionPercent")}>{canSeeSensitive ? `${Number(staff.commission_percent ?? 0).toFixed(2)}%` : MASK}</Field>
            <Field label={t("weeklyHours")}>{staff.working_hours_per_week}</Field>
            <Field label={t("annualLeave")}>{staff.annual_leave_balance}</Field>
            <Field label={t("sickLeave")}>{staff.sick_leave_balance}</Field>
            <Field label={t("bankName")}>{canSeeSensitive ? (staff.bank_name ?? "—") : MASK}</Field>
            <Field label={t("bankAccount")}>{canSeeSensitive ? (staff.bank_account ?? "—") : MASK}</Field>
            <Field label={t("nationalId")}>{canSeeSensitive ? (staff.national_id ?? "—") : MASK}</Field>
            <Field label={t("dob")}>{canSeeSensitive ? formatDate(staff.date_of_birth, lang) : MASK}</Field>
            <Field label={t("emergencyContact")}>{staff.emergency_contact_name ?? "—"}</Field>
            <Field label={t("emergencyPhone")}>{staff.emergency_contact_phone ?? "—"}</Field>
            <Field label={t("address")} className="sm:col-span-2">{staff.address ?? "—"}</Field>
          </Card>
        </TabsContent>
        <TabsContent value="schedule">
          <Card className="p-5 shadow-card">
            <div className="grid grid-cols-7 gap-2 text-center">
              {DAYS.map((d, i) => {
                const slot = schedule.find((s) => s.day_of_week === i);
                return (
                  <div key={d} className="border rounded-lg p-3">
                    <div className="font-semibold text-xs">{t(d as any)}</div>
                    {slot && slot.is_working_day ? (
                      <div className="mt-1 text-xs">{slot.start_time?.slice(0,5)} – {slot.end_time?.slice(0,5)}</div>
                    ) : <div className="mt-1 text-xs text-muted-foreground">{t("off")}</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="attendance">
          <Card className="p-3 shadow-card">
            {attendance.length === 0 ? <div className="p-6 text-center text-muted-foreground">—</div> : (
              <div className="divide-y divide-border">
                {attendance.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 text-sm">
                    <div className="flex-1">{formatDate(a.date, lang)}</div>
                    <div className="text-xs text-muted-foreground">{a.check_in_time ?? "—"} → {a.check_out_time ?? "—"}</div>
                    <Badge variant="outline">{a.working_hours} {t("workingHours")}</Badge>
                    <Badge variant="outline">{a.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="leaves">
          <Card className="p-3 shadow-card">
            {leaves.length === 0 ? <div className="p-6 text-center text-muted-foreground">—</div> : (
              <div className="divide-y divide-border">
                {leaves.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 p-3 text-sm">
                    <div className="flex-1">{lang === "ar" ? l.leave_type?.name_ar : l.leave_type?.name_en}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(l.start_date, lang)} → {formatDate(l.end_date, lang)}</div>
                    <Badge variant="outline">{l.total_days} {t("totalDays")}</Badge>
                    <Badge variant="outline">{l.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="payroll">
          <Card className="p-3 shadow-card">
            {payroll.length === 0 ? <div className="p-6 text-center text-muted-foreground">—</div> : (
              <div className="divide-y divide-border">
                {payroll.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 text-sm">
                    <div className="flex-1">{p.period_year}-{String(p.period_month).padStart(2,"0")}</div>
                    <div className="text-xs text-muted-foreground">{t("baseSalary")}: {formatMoney(p.base_salary, lang)}</div>
                    <Badge variant="outline">{formatMoney(p.net_salary, lang)}</Badge>
                    <Badge variant="outline">{p.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="branches">
          {id && <StaffBranchesTab userId={id} />}
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmUnlink} onOpenChange={(o) => !o && !busy && setConfirmUnlink(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "ar" ? "فك ربط المستخدم؟" : "Unlink user?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? "سيتم إزالة كل الأدوار وأرشفة سجل الموظف. يظل حساب المستخدم موجوداً بلا صلاحيات."
                : "All roles will be removed and the employee record archived. The user account remains but will have no access."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={unlinkUser} disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy ? "…" : (lang === "ar" ? "فك الربط" : "Unlink")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={linkOpen} onOpenChange={(o) => !o && !linking && setLinkOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {linkMode === "replace"
                ? (lang === "ar" ? "استبدال المستخدم المربوط" : "Replace linked user")
                : (lang === "ar" ? "ربط بمستخدم" : "Link to a user")}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "المستخدمون المربوطون بموظف آخر يظهرون كغير متاحين."
                : "Users already linked to another employee are shown as unavailable."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-auto rounded border divide-y">
            {candidateUsers.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {lang === "ar" ? "لا يوجد مستخدمون." : "No users."}
              </div>
            )}
            {candidateUsers.map((u) => {
              const isSelf = (staff as any)?.linked_user_id === u.id;
              const disabled = u._taken && !isSelf;
              const selected = pickedUserId === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setPickedUserId(u.id)}
                  className={`w-full text-start p-3 text-sm flex items-center gap-3 ${
                    disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted"
                  } ${selected ? "bg-primary/10" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{u.full_name ?? u.email}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  </div>
                  {isSelf && <Badge variant="outline">{lang === "ar" ? "الحالي" : "Current"}</Badge>}
                  {disabled && (
                    <Badge variant="secondary">
                      {lang === "ar" ? "غير متاح — مربوط" : "Unavailable — linked"}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)} disabled={linking}>
              {t("cancel")}
            </Button>
            <Button onClick={confirmLink} disabled={linking || !pickedUserId}
              className="gradient-primary text-primary-foreground">
              {linking ? "…" : (linkMode === "replace" ? (lang === "ar" ? "استبدال" : "Replace") : (lang === "ar" ? "ربط" : "Link"))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}