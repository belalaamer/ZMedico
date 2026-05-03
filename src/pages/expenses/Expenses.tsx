import { useEffect, useState } from "react";
import { useDataSync } from "@/lib/dataSync";
import { Plus, Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDate } from "@/lib/format";
import { RowActions } from "@/components/RowActions";

export default function Expenses() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category_id: "", amount: 0, description_en: "", description_ar: "",
    expense_date: new Date().toISOString().slice(0,10), payment_method: "cash" as "cash"|"card"|"bank_transfer",
  });

  const load = async () => {
    let q = supabase.from("expenses").select("*, expense_categories(name_en,name_ar)").is("deleted_at", null).order("expense_date", { ascending: false }).limit(200);
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    const { data } = await q;
    setItems(data ?? []);
  };
  useEffect(() => {
    load();
    supabase.from("expense_categories").select("*").order("name_en").then(({ data }) => setCats(data ?? []));
    /* eslint-disable-next-line */
  }, [currentBranchId]);
  useDataSync(["expenses"], () => { load(); });

  const softDelete = async (x: any): Promise<void> => {
    const { error } = await supabase.from("expenses").update({ deleted_at: new Date().toISOString() } as any).eq("id", x.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete")); load();
  };

  const save = async () => {
    if (!currentBranchId) { toast.error("Select a branch"); return; }
    if (!form.amount || form.amount <= 0) { toast.error("Amount required"); return; }
    if (!form.description_en) { toast.error("Description required"); return; }
    const { error } = await supabase.from("expenses").insert({
      branch_id: currentBranchId,
      category_id: form.category_id || null,
      amount: form.amount,
      description_en: form.description_en,
      description_ar: form.description_en,
      expense_date: form.expense_date,
      payment_method: form.payment_method,
      created_by: user?.id ?? null,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(t("save"));
    setOpen(false);
    setForm({ category_id: "", amount: 0, description_en: "", description_ar: "", expense_date: new Date().toISOString().slice(0,10), payment_method: "cash" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("expenses")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} {t("expenses").toLowerCase()}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4" />{t("addExpense")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("addExpense")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("expenseCategory")}</Label>
                  <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                    <SelectTrigger><SelectValue placeholder={t("selectCategory")} /></SelectTrigger>
                    <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("amount")}</Label>
                  <Input type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("description")}</Label>
                <Textarea value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value, description_ar: e.target.value })} maxLength={500} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("invoiceDate")}</Label>
                  <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t("method")}</Label>
                  <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{t("cash")}</SelectItem>
                      <SelectItem value="card">{t("card")}</SelectItem>
                      <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-card overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("noExpenses")}</div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((x) => (
              <div key={x.id} className="flex items-center gap-4 p-4">
                <div className="size-10 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center">
                  <Receipt className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{lang === "ar" ? (x.description_ar || x.description_en) : x.description_en}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(x.expense_date, lang)} · {t(x.payment_method as any) ?? x.payment_method}
                  </div>
                </div>
                {x.expense_categories && (
                  <Badge variant="outline" className="text-[10px]">
                    {lang === "ar" ? x.expense_categories.name_ar : x.expense_categories.name_en}
                  </Badge>
                )}
                <div className="font-semibold tabular-nums text-destructive">- {formatMoney(x.amount, lang)}</div>
                <RowActions canEdit={false} onDelete={() => softDelete(x)} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}