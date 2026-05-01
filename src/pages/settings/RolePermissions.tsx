import { useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";

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
  const [matrix, setM] = useState(DEFAULT);

  const toggle = (role: string, mod: string, act: string) => {
    const set = new Set(matrix[role][mod]);
    set.has(act) ? set.delete(act) : set.add(act);
    setM({ ...matrix, [role]: { ...matrix[role], [mod]: Array.from(set) } });
  };

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("rolePermissions")}</h1>
          <Button className="gradient-primary text-primary-foreground" onClick={() => { localStorage.setItem("zmedico.role_permissions", JSON.stringify(matrix)); toast.success(t("saved")); }}>{t("save")}</Button>
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
                    <td key={r} className="p-3"><div className="flex flex-wrap gap-2 justify-center">
                      {ACTIONS.map(a => (
                        <label key={a} className="flex items-center gap-1 text-xs">
                          <Checkbox checked={matrix[r]?.[m]?.includes(a)} onCheckedChange={() => toggle(r, m, a)} />
                          <span>{a}</span>
                        </label>
                      ))}
                    </div></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-xs text-muted-foreground">Permissions are stored locally as a reference matrix; effective access is enforced server-side via roles.</p>
      </div>
    </SettingsLayout>
  );
}