import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { toast } from "@/hooks/use-toast";

type Branch = { id: string; name_en: string; name_ar: string };

/**
 * Minimal UI on top of staff_branches(user_id, branch_id).
 * - admin / hr can assign and revoke branches for the given user.
 * - everyone else sees a read-only list (RLS already limits them to their own row).
 */
export default function StaffBranchesTab({ userId }: { userId: string }) {
  const { lang } = useI18n();
  // R2: manage-branches gate routed through AuthorizationService.
  const { authz } = useAuthorization("StaffBranchesTab");
  const canManage = authz.hasRoleAny("hr");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pick, setPick] = useState<string>("");

  const branchName = (b: Branch) => (lang === "ar" ? b.name_ar : b.name_en);
  const T = {
    title: lang === "ar" ? "صلاحيات الفروع" : "Branch access",
    subtitle: lang === "ar"
      ? "الفروع التي يمكن لهذا المستخدم رؤية بياناتها."
      : "Branches whose data this user can see.",
    empty: lang === "ar" ? "لا توجد فروع معيّنة." : "No branches assigned.",
    add: lang === "ar" ? "إضافة فرع" : "Add branch",
    pick: lang === "ar" ? "اختر فرعًا…" : "Select a branch…",
    remove: lang === "ar" ? "إزالة" : "Remove",
    confirmTitle: lang === "ar" ? "إزالة الوصول إلى الفرع؟" : "Remove branch access?",
    confirmDesc: lang === "ar"
      ? "لن يتمكن هذا المستخدم من رؤية بيانات هذا الفرع بعد الآن."
      : "This user will no longer see data from this branch.",
    cancel: lang === "ar" ? "إلغاء" : "Cancel",
    confirm: lang === "ar" ? "تأكيد" : "Confirm",
    readonly: lang === "ar" ? "للعرض فقط" : "Read-only",
  };

  async function load() {
    setLoading(true);
    const [{ data: br }, { data: sb }] = await Promise.all([
      supabase.from("branches").select("id,name_en,name_ar").order("name_en"),
      supabase.from("staff_branches").select("branch_id").eq("user_id", userId),
    ]);
    setBranches((br ?? []) as Branch[]);
    setAssigned(((sb ?? []) as any[]).map((r) => r.branch_id));
    setLoading(false);
  }

  useEffect(() => { if (userId) load(); /* eslint-disable-next-line */ }, [userId]);

  const available = branches.filter((b) => !assigned.includes(b.id));

  async function add() {
    if (!pick) return;
    setSaving(true);
    const { error } = await supabase
      .from("staff_branches")
      .insert({ user_id: userId, branch_id: pick });
    setSaving(false);
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    setPick("");
    toast({ title: lang === "ar" ? "تمت إضافة الفرع" : "Branch added" });
    load();
  }

  async function remove(branchId: string) {
    setSaving(true);
    const { error } = await supabase
      .from("staff_branches")
      .delete()
      .eq("user_id", userId)
      .eq("branch_id", branchId);
    setSaving(false);
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    toast({ title: lang === "ar" ? "تمت الإزالة" : "Branch removed" });
    load();
  }

  if (loading) {
    return <Card className="p-6 shadow-card"><div className="h-6 w-40 rounded bg-muted animate-pulse" /></Card>;
  }

  const assignedBranches = branches.filter((b) => assigned.includes(b.id));

  return (
    <Card className="p-5 shadow-card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{T.title}</div>
          <div className="text-xs text-muted-foreground">{T.subtitle}</div>
        </div>
        {!canManage && <Badge variant="outline">{T.readonly}</Badge>}
      </div>

      {assignedBranches.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">
          {T.empty}
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border">
          {assignedBranches.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-3 text-sm">
              <Building2 className="size-4 text-muted-foreground" />
              <div className="flex-1 font-medium">{branchName(b)}</div>
              {canManage && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={saving}>
                      <Trash2 className="size-4" />
                      <span className="ms-1 hidden sm:inline">{T.remove}</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{T.confirmTitle}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {T.confirmDesc} <span className="font-medium">{branchName(b)}</span>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{T.cancel}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(b.id)}>{T.confirm}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="flex items-center gap-2 pt-2">
          <Select value={pick} onValueChange={setPick} disabled={available.length === 0 || saving}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder={T.pick} />
            </SelectTrigger>
            <SelectContent>
              {available.map((b) => (
                <SelectItem key={b.id} value={b.id}>{branchName(b)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={add} disabled={!pick || saving}>
            <Plus className="size-4 me-1" /> {T.add}
          </Button>
        </div>
      )}
    </Card>
  );
}