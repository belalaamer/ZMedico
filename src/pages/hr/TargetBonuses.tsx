import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Plus, Trash2, Target, TrendingUp } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Fab } from "@/components/ui/fab";

type StaffOpt = { id: string; full_name: string | null; email: string | null };
type Target = {
  id: string;
  staff_id: string;
  branch_id: string | null;
  name_en: string | null; name_ar: string | null;
  metric_type: string;
  target_value: number;
  bonus_type: string;
  bonus_value: number;
  period_start: string; period_end: string;
  status: string;
  notes: string | null;
};

const METRICS = [
  { value: "revenue", en: "Revenue (invoices)", ar: "الإيرادات (فواتير)" },
  { value: "collections", en: "Collections received", ar: "المدفوعات المستلمة" },
  { value: "appointments_completed", en: "Completed appointments", ar: "المواعيد المكتملة" },
  { value: "procedures_count", en: "Procedures count", ar: "عدد الإجراءات" },
  { value: "procedures_revenue", en: "Procedures revenue", ar: "إيرادات الإجراءات" },
];

export default function TargetBonusesPage() {
  const { lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [items, setItems] = useState<Target[]>([]);
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [actuals, setActuals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Target | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const emptyForm = {
    staff_id: "",
    name: "",
    metric_type: "revenue",
    target_value: "",
    bonus_type: "fixed" as "fixed" | "percent_of_target" | "percent_of_actual",
    bonus_value: "",
    period_start: monthStart,
    period_end: monthEnd,
    notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("staff_targets").select("*").order("period_end", { ascending: false }).limit(200);
    if (currentBranchId) q = q.or(`branch_id.eq.${currentBranchId},branch_id.is.null`);
    const { data: ts, error } = await q;
    const { data: sps } = await supabase.from("staff_profiles").select("id").eq("status","active").limit(500);
    const ids = (sps ?? []).map((s: any) => s.id);
    let sp: StaffOpt[] = [];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      sp = (profs ?? []) as StaffOpt[];
    }
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((ts ?? []) as Target[]);
    setStaff(sp);

    // fetch actuals
    const rows = (ts ?? []) as Target[];
    const results = await Promise.all(rows.map(r =>
      supabase.rpc("staff_target_actual", { _target_id: r.id }).then(({ data }) => [r.id, Number(data ?? 0)] as const)
    ));
    setActuals(Object.fromEntries(results));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId]);

  const staffOptions = useMemo(() => staff.map(s => ({
    value: s.id,
    label: s.full_name || s.email || s.id.slice(0, 8),
  })), [staff]);

  const staffName = (id: string) => staffOptions.find(o => o.value === id)?.label ?? "—";
  const metricLabel = (m: string) => METRICS.find(x => x.value === m)?.[lang === "ar" ? "ar" : "en"] ?? m;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staff_id || !form.target_value || !form.period_start || !form.period_end) {
      toast.error(lang === "ar" ? "أكمل الحقول المطلوبة" : "Please fill required fields"); return;
    }
    const payload = {
      staff_id: form.staff_id,
      branch_id: currentBranchId,
      name_en: form.name || null,
      name_ar: form.name || null,
      metric_type: form.metric_type,
      target_value: Number(form.target_value),
      bonus_type: form.bonus_type,
      bonus_value: Number(form.bonus_value || 0),
      period_start: form.period_start,
      period_end: form.period_end,
      notes: form.notes || null,
    };
    const { error } = await supabase.from("staff_targets").insert(payload as any);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم حفظ الهدف" : "Target saved");
    setOpen(false);
    setForm(emptyForm);
    load();
  };

  const handleDelete = async (t: Target) => {
    const { error } = await supabase.from("staff_targets").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم الحذف" : "Deleted");
    setConfirmDel(null);
    load();
  };

  const computeBonus = (t: Target, actual: number) => {
    if (actual < t.target_value) return 0;
    if (t.bonus_type === "fixed") return Number(t.bonus_value);
    if (t.bonus_type === "percent_of_target") return (Number(t.target_value) * Number(t.bonus_value)) / 100;
    return (actual * Number(t.bonus_value)) / 100;
  };

  const isMoney = (m: string) => m === "revenue" || m === "collections" || m === "procedures_revenue";
  const fmt = (n: number, money: boolean) => money ? `${n.toFixed(2)} ${lang === "ar" ? "ج.م" : "EGP"}` : `${n}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Target className="size-6 text-primary" />
            {lang === "ar" ? "أهداف ومكافآت الأداء" : "Target Bonuses"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "ar" ? "ضع أهدافًا للموظفين وتتبع المكافآت التلقائية" : "Set staff performance targets and auto-track bonuses"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground hidden sm:inline-flex">
              <Plus className="me-2 size-4" />{lang === "ar" ? "هدف جديد" : "New target"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{lang === "ar" ? "هدف جديد" : "New target"}</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>{lang === "ar" ? "الموظف" : "Staff member"} *</Label>
                <Combobox options={staffOptions} value={form.staff_id} onChange={(v) => setForm({ ...form, staff_id: v })} placeholder="—" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{lang === "ar" ? "الاسم/الوصف" : "Label / description"}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={lang === "ar" ? "مثال: هدف يوليو" : "e.g. July target"} />
              </div>
              <div className="space-y-2">
                <Label>{lang === "ar" ? "المقياس" : "Metric"} *</Label>
                <Select value={form.metric_type} onValueChange={(v) => setForm({ ...form, metric_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METRICS.map(m => <SelectItem key={m.value} value={m.value}>{lang === "ar" ? m.ar : m.en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{lang === "ar" ? "قيمة الهدف" : "Target value"} *</Label>
                <Input type="number" min="0" step="0.01" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{lang === "ar" ? "نوع المكافأة" : "Bonus type"}</Label>
                <Select value={form.bonus_type} onValueChange={(v) => setForm({ ...form, bonus_type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">{lang === "ar" ? "مبلغ ثابت" : "Fixed amount"}</SelectItem>
                    <SelectItem value="percent_of_target">{lang === "ar" ? "% من الهدف" : "% of target"}</SelectItem>
                    <SelectItem value="percent_of_actual">{lang === "ar" ? "% من الفعلي" : "% of actual"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{lang === "ar" ? "قيمة المكافأة" : "Bonus value"}</Label>
                <Input type="number" min="0" step="0.01" value={form.bonus_value} onChange={(e) => setForm({ ...form, bonus_value: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{lang === "ar" ? "من تاريخ" : "Period start"} *</Label>
                <Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{lang === "ar" ? "إلى تاريخ" : "Period end"} *</Label>
                <Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{lang === "ar" ? "ملاحظات" : "Notes"}</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <DialogFooter className="sm:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
                <Button type="submit" className="gradient-primary text-primary-foreground">{lang === "ar" ? "حفظ" : "Save"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <Card className="p-10 text-center text-muted-foreground">...</Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          {lang === "ar" ? "لا توجد أهداف بعد" : "No targets yet"}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((t) => {
            const actual = actuals[t.id] ?? 0;
            const pct = Math.min(100, Math.round((actual / Number(t.target_value)) * 100));
            const achieved = actual >= Number(t.target_value);
            const bonus = computeBonus(t, actual);
            const money = isMoney(t.metric_type);
            return (
              <Card key={t.id} className="p-4 space-y-3 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{staffName(t.staff_id)}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t.name_en || metricLabel(t.metric_type)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={achieved ? "default" : "outline"} className={achieved ? "bg-emerald-600" : ""}>
                      {achieved ? (lang === "ar" ? "محقق" : "Achieved") : `${pct}%`}
                    </Badge>
                    <Button variant="ghost" size="icon" className="text-destructive size-8" onClick={() => setConfirmDel(t)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>{metricLabel(t.metric_type)}</span>
                  <span>·</span>
                  <span>{t.period_start} → {t.period_end}</span>
                </div>
                <Progress value={pct} className="h-2" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{lang === "ar" ? "الفعلي" : "Actual"}: <b className="text-foreground">{fmt(actual, money)}</b></span>
                  <span className="text-muted-foreground">{lang === "ar" ? "الهدف" : "Target"}: <b className="text-foreground">{fmt(Number(t.target_value), money)}</b></span>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <TrendingUp className="size-4 text-primary" />
                  <span className="text-sm">{lang === "ar" ? "المكافأة" : "Bonus"}:</span>
                  <span className={`font-bold ${achieved ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {bonus.toFixed(2)} {lang === "ar" ? "ج.م" : "EGP"}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Fab ariaLabel={lang === "ar" ? "هدف جديد" : "New target"} onClick={() => setOpen(true)}>
        <Plus className="size-6" />
      </Fab>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "ar" ? "حذف الهدف" : "Delete target"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar" ? "لا يمكن التراجع عن هذا الإجراء." : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && handleDelete(confirmDel)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {lang === "ar" ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}