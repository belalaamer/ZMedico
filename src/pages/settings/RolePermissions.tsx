import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { ShieldCheck, Info } from "lucide-react";

const ROLES = ["admin", "manager", "doctor", "nurse", "receptionist", "accountant"];
const MODULES = ["patients", "appointments", "medical_records", "invoices", "treasury", "inventory", "reports", "settings"];
const ACTIONS = ["view", "create", "edit", "delete", "export"];

const DEFAULT: Record<string, Record<string, string[]>> = {
  admin: Object.fromEntries(MODULES.map(m => [m, [...ACTIONS]])),
  manager: Object.fromEntries(MODULES.map(m => [m, ["view","create","edit","export"]])),
  doctor: { patients: ["view","edit"], appointments: ["view","create","edit"], medical_records: ["view","create","edit"], invoices: ["view"], treasury: [], inventory: ["view"], reports: ["view"], settings: [] },
  nurse: { patients: ["view"], appointments: ["view"], medical_records: ["view"], invoices: [], treasury: [], inventory: ["view"], reports: [], settings: [] },
  receptionist: { patients: ["view","create","edit"], appointments: ["view","create","edit"], medical_records: [], invoices: ["view","create"], treasury: [], inventory: [], reports: [], settings: [] },
  accountant: { patients: ["view"], appointments: ["view"], medical_records: [], invoices: ["view","create","edit","export"], treasury: ["view","create","edit"], inventory: ["view"], reports: ["view","export"], settings: [] },
};

export default function RolePermissions() {
  const { t } = useI18n();
  const matrix = DEFAULT;

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="size-6 text-primary" />
            {t("rolePermissions")}
          </h1>
          <Badge variant="outline">Read-only reference</Badge>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm flex gap-2">
          <Info className="size-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-muted-foreground">
            This matrix documents the intended access for each role. Effective access is enforced server-side via database row-level security policies and the <code className="text-foreground">user_roles</code> table — it cannot be changed from this page. To change a user&apos;s role, use User Management.
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
                  <td className="p-3 font-medium capitalize">{m.replace("_"," ")}</td>
                  {ROLES.map(r => (
                    <td key={r} className="p-3">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {ACTIONS.map(a => {
                          const allowed = matrix[r]?.[m]?.includes(a);
                          return (
                            <Badge
                              key={a}
                              variant={allowed ? "default" : "outline"}
                              className={allowed ? "" : "opacity-40"}
                            >
                              {a}
                            </Badge>
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