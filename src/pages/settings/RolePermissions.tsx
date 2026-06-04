import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { ShieldCheck, Info, Save, RotateCcw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
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
};

type Matrix = Record<string, Record<string, string[]>>;

function emptyMatrix(): Matrix {
  const m: Matrix = {};
  ROLES.forEach(r => { m[r] = {}; MODULES.forEach(mod => { m[r][mod] = []; }); });
  return m;
}

export default function RolePermissions() {
  const { t, lang } = useI18n();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [matrix, setMatrix] = useState<Matrix>(() => JSON.parse(JSON.stringify(DEFAULT)));
  const [original, setOriginal] = useState<Matrix>(() => JSON.parse(JSON.stringify(DEFAULT)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    if (!isAdmin) return;
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
    const { error } = await (supabase as any)
      .from("role_permissions")
      .upsert(rows, { onConflict: "role,module" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
    setOriginal(JSON.parse(JSON.stringify(matrix)));
  };

  const resetDefaults = () => {
    setMatrix(JSON.parse(JSON.stringify(DEFAULT)));
  };

  if (!roleLoading && !isAdmin) return <Navigate to="/settings/general" replace />;

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="size-6 text-primary" />
            {t("rolePermissions")}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            {!isAdmin && <Badge variant="outline">Read-only</Badge>}
            {isAdmin && (
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
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm flex gap-2">
          <Info className="size-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-muted-foreground">
            {lang === "ar"
              ? "هذه المصفوفة توثّق صلاحيات كل دور. التطبيق الفعلي للصلاحيات يتم على مستوى قاعدة البيانات عبر سياسات RLS وجدول user_roles. لتغيير دور مستخدم استخدم إدارة المستخدمين."
              : "This matrix documents the intended access for each role. Effective access is enforced server-side via RLS policies and the user_roles table. To change a user's role, use User Management."}
          </p>
        </div>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr>
              <th className="text-start p-3">{t("moduleName")}</th>
              {ROLES.map(r => <th key={r} className="p-3 text-center capitalize">{r}</th>)}
            </tr></thead>
            <tbody>
              {MODULES.map(m => (
                <tr key={m} className="border-t">
                  <td className="p-3 font-medium">{MODULE_LABELS[m]?.[lang === "ar" ? "ar" : "en"] ?? m.replace("_"," ")}</td>
                  {ROLES.map(r => (
                    <td key={r} className="p-3 align-top">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {ACTIONS.map(a => {
                          const allowed = matrix[r]?.[m]?.includes(a);
                          return (
                            <button
                              type="button"
                              key={a}
                              onClick={() => toggle(r, m, a)}
                              disabled={!isAdmin || loading}
                              className={
                                "transition " +
                                (isAdmin ? "cursor-pointer hover:scale-105" : "cursor-default")
                              }
                              aria-pressed={allowed}
                            >
                              <Badge
                                variant={allowed ? "default" : "outline"}
                                className={allowed ? "" : "opacity-40"}
                              >
                                {a}
                              </Badge>
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </SettingsLayout>
  );
}