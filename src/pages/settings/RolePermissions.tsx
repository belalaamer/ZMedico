import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { ShieldCheck, Info, Save, RotateCcw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { toast } from "sonner";
import { ROLES as ALL_ROLES, MODULES as ALL_MODULES, ACTIONS as ALL_ACTIONS, DEFAULT_PERMISSIONS } from "@/lib/rolePermissions";

const ROLES = [...ALL_ROLES];
const MODULES = [...ALL_MODULES];
const ACTIONS = [...ALL_ACTIONS];
const DEFAULT = DEFAULT_PERMISSIONS;

const MODULE_LABELS: Record<string, { ar: string; en: string }> = {
  patients: { ar: "المرضى", en: "Patients" },
  appointments: { ar: "المواعيد", en: "Appointments" },
  medical_records: { ar: "السجلات الطبية", en: "Medical Records" },
  treatment_plans: { ar: "خطط العلاج", en: "Treatment Plans" },
  invoices: { ar: "الفواتير", en: "Invoices" },
  treasury: { ar: "الخزينة", en: "Treasury" },
  inventory: { ar: "المخزون", en: "Inventory" },
  reports: { ar: "التقارير", en: "Reports" },
  hr: { ar: "الموارد البشرية", en: "HR" },
  settings: { ar: "الإعدادات", en: "Settings" },
  coupons: { ar: "الكوبونات", en: "Coupons" },
};

type Matrix = Record<string, Record<string, string[]>>;

function emptyMatrix(): Matrix {
  const m: Matrix = {};
  ROLES.forEach(r => { m[r] = {}; MODULES.forEach(mod => { m[r][mod] = []; }); });
  return m;
}

export default function RolePermissions() {
  const { t, lang } = useI18n();
  // Production authorization is canonical. This page edits only the legacy
  // fallback matrix, and the database RPC deliberately allows that write to
  // the System Owner only.
  const { authz } = useAuthorization("RolePermissions");
  const canEditMatrix = authz.holdsAnyRole("system_owner");
  const [matrix, setMatrix] = useState<Matrix>(() => JSON.parse(JSON.stringify(DEFAULT)));
  const [original, setOriginal] = useState<Matrix>(() => JSON.parse(JSON.stringify(DEFAULT)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(ROLES[0]);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("role_permissions")
      .select("role,module,actions");
    const base = emptyMatrix();
    // start with defaults
    ROLES.forEach(r => MODULES.forEach(m => {
      base[r][m] = DEFAULT[r]?.[m] ? [...DEFAULT[r][m]] : [];
    }));
    (data ?? []).forEach((row: any) => {
      if (!base[row.role]) base[row.role] = {};
      base[row.role][row.module] = Array.isArray(row.actions) ? row.actions : [];
    });
    setMatrix(JSON.parse(JSON.stringify(base)));
    setOriginal(JSON.parse(JSON.stringify(base)));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const dirty = JSON.stringify(matrix) !== JSON.stringify(original);

  const toggle = (role: string, module: string, action: string) => {
    if (!canEditMatrix) return;
    setMatrix(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as Matrix;
      const list = new Set(next[role]?.[module] ?? []);
      if (list.has(action)) list.delete(action); else list.add(action);
      if (!next[role]) next[role] = {};
      next[role][module] = Array.from(list);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    const rows: any[] = [];
    ROLES.forEach(r => MODULES.forEach(m => {
      rows.push({ role: r, module: m, actions: matrix[r]?.[m] ?? [] });
    }));
    // M2 Settings cutover: transactional matrix save through
    // settings_save_role_permissions (SECURITY DEFINER). Eliminates the
    // partial-write hazard of the previous client-side batch upsert.
    const { error } = await (supabase as any).rpc(
      "settings_save_role_permissions",
      { _matrix: rows },
    );
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
    setOriginal(JSON.parse(JSON.stringify(matrix)));
  };

  const resetDefaults = () => {
    setMatrix(JSON.parse(JSON.stringify(DEFAULT)));
  };


  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="size-6 text-primary" />
            {t("rolePermissions")}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            {!canEditMatrix && <Badge variant="outline">Read-only</Badge>}
            {canEditMatrix && (
              <>
                <Button variant="outline" size="sm" onClick={resetDefaults} disabled={saving}>
                  <RotateCcw className="me-2 size-4" />
                  {lang === "ar" ? "استعادة الافتراضي" : "Reset defaults"}
                </Button>
                <Button
                  size="sm"
                  onClick={save}
                  disabled={!dirty || saving}
                  className="gradient-primary text-primary-foreground"
                >
                  {saving ? <Loader2 className="me-2 size-4 animate-spin" /> : <Save className="me-2 size-4" />}
                  {lang === "ar" ? "حفظ" : "Save"}
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm flex gap-2">
          <Info className="size-4 mt-0.5 text-primary shrink-0" />
          <p className="text-foreground/80">
            {lang === "ar"
              ? "هذه مصفوفة الصلاحيات الاحتياطية القديمة (Legacy fallback). صلاحيات Production الفعلية تأتي من نظام Canonical Authorization وسياسات RLS. يمكن لـ System Owner فقط تعديل هذه المصفوفة، وتعديلها لا يغيّر صلاحيات Canonical الحالية."
              : "This is the legacy fallback permission matrix. Production access is decided by Canonical Authorization and RLS. Only the System Owner may edit this fallback matrix, and changing it does not change the current canonical grants."}
          </p>
        </div>
        <Card className="p-0 shadow-card overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 p-4 bg-muted/40 border-b border-border">
            <div className="w-full md:w-80">
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">
                {lang === "ar" ? "الدور" : "Role"}
              </label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="h-10 w-full capitalize bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground md:text-end">
              {canEditMatrix
                ? (lang === "ar" ? "اختر دورًا ثم عدّل صلاحيات الـLegacy fallback." : "Pick a role, then edit the legacy fallback permissions.")
                : (lang === "ar" ? "عرض فقط — التعديل متاح لـ System Owner." : "Read-only — editing is restricted to the System Owner.")}
            </div>
          </div>

          <div className="p-4">
            <div className="rounded-lg overflow-hidden border border-border">
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 backdrop-blur bg-background/90 border-b border-border">
                    <tr>
                      <th className="text-start p-3 font-semibold min-w-[180px] sticky start-0 bg-background/90 z-20 uppercase tracking-wider text-xs text-muted-foreground">
                        {t("moduleName")}
                      </th>
                      {ACTIONS.map(a => (
                        <th key={a} className="p-3 text-center font-semibold capitalize whitespace-nowrap uppercase tracking-wider text-xs text-muted-foreground">
                          {a}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((m) => (
                      <tr
                        key={m}
                        className="border-t border-border hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-3 font-medium sticky start-0 bg-background">
                          {MODULE_LABELS[m]?.[lang === "ar" ? "ar" : "en"] ?? m.replace("_", " ")}
                        </td>
                        {ACTIONS.map(a => {
                          const allowed = !!matrix[selectedRole]?.[m]?.includes(a);
                          const isSoftCancel =
                            selectedRole === "receptionist" && m === "appointments" && a === "delete";
                          return (
                            <td key={a} className="p-3 text-center align-middle">
                              <div className="flex flex-col items-center justify-center gap-1">
                                <Checkbox
                                  checked={allowed}
                                  disabled={!canEditMatrix || loading}
                                  onCheckedChange={() => toggle(selectedRole, m, a)}
                                  aria-label={`${m} ${a}`}
                                />
                                {isSoftCancel && (
                                  <span
                                    className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm mt-1 uppercase tracking-wider"
                                    title={lang === "ar"
                                      ? "للحذف على مستوى المستقبلين يتم تنفيذ إلغاء ناعم"
                                      : "Receptionist delete performs a soft-cancel"}
                                  >
                                    {lang === "ar" ? "إلغاء ناعم" : "soft-cancel"}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </SettingsLayout>
  );
}