import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDate } from "@/lib/format";
import { statusLabel } from "./Staff";
import StaffBranchesTab from "./StaffBranchesTab";

const DAYS = ["sun","mon","tue","wed","thu","fri","sat"] as const;

export default function StaffDetail() {
  const { t, lang } = useI18n();
  const { id } = useParams();
  const [staff, setStaff] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [position, setPosition] = useState<any>(null);
  const [dept, setDept] = useState<any>(null);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);

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
    })();
  }, [id]);

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
            <Field label={t("salary")}>{formatMoney(staff.salary, lang, staff.salary_currency)}</Field>
            <Field label={t("commissionPercent")}>{Number(staff.commission_percent ?? 0).toFixed(2)}%</Field>
            <Field label={t("weeklyHours")}>{staff.working_hours_per_week}</Field>
            <Field label={t("annualLeave")}>{staff.annual_leave_balance}</Field>
            <Field label={t("sickLeave")}>{staff.sick_leave_balance}</Field>
            <Field label={t("bankName")}>{staff.bank_name ?? "—"}</Field>
            <Field label={t("bankAccount")}>{staff.bank_account ?? "—"}</Field>
            <Field label={t("nationalId")}>{staff.national_id ?? "—"}</Field>
            <Field label={t("dob")}>{formatDate(staff.date_of_birth, lang)}</Field>
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