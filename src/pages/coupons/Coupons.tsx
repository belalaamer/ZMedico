import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Ticket, Search } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Fab } from "@/components/ui/fab";

type Coupon = {
  id: string; code: string; description: string | null;
  discount_type: "percent" | "fixed"; discount_value: number;
  min_order_amount: number | null; max_discount_amount: number | null;
  usage_limit: number | null; usage_count: number;
  starts_at: string | null; ends_at: string | null;
  is_active: boolean; branch_id: string | null;
};

export default function CouponsPage() {
  const { lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [items, setItems] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Coupon | null>(null);

  const empty = {
    code: "", description: "",
    discount_type: "percent" as "percent" | "fixed",
    discount_value: "", min_order_amount: "",
    max_discount_amount: "", usage_limit: "",
    starts_at: "", ends_at: "", is_active: true,
  };
  const [form, setForm] = useState(empty);

  const load = async () => {
    setLoading(true);
    let qy = supabase.from("coupons").select("*").order("created_at", { ascending: false }).limit(200);
    if (currentBranchId) qy = qy.or(`branch_id.eq.${currentBranchId},branch_id.is.null`);
    const { data, error } = await qy;
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Coupon[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.discount_value) {
      toast.error(lang === "ar" ? "أكمل الحقول المطلوبة" : "Fill required fields"); return;
    }
    const payload: any = {
      code: form.code.trim().toUpperCase(),
      description: form.description || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_order_amount: form.min_order_amount ? Number(form.min_order_amount) : 0,
      max_discount_amount: form.max_discount_amount ? Number(form.max_discount_amount) : null,
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      is_active: form.is_active,
      branch_id: currentBranchId,
    };
    const { error } = await supabase.from("coupons").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم حفظ الكوبون" : "Coupon saved");
    setOpen(false); setForm(empty); load();
  };

  const remove = async (c: Coupon) => {
    const { error } = await supabase.from("coupons").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم الحذف" : "Deleted");
    setDel(null); load();
  };

  const toggle = async (c: Coupon) => {
    const { error } = await supabase.from("coupons").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const statusOf = (c: Coupon): { label: string; tone: string } => {
    if (!c.is_active) return { label: lang === "ar" ? "موقوف" : "Disabled", tone: "bg-muted text-foreground" };
    const today = new Date().toISOString().slice(0,10);
    if (c.ends_at && c.ends_at < today) return { label: lang === "ar" ? "منتهي" : "Expired", tone: "bg-destructive/10 text-destructive" };
    if (c.usage_limit != null && c.usage_count >= c.usage_limit) return { label: lang === "ar" ? "نفد" : "Used up", tone: "bg-destructive/10 text-destructive" };
    if (c.starts_at && c.starts_at > today) return { label: lang === "ar" ? "قادم" : "Scheduled", tone: "bg-amber-500/10 text-amber-700" };
    return { label: lang === "ar" ? "نشط" : "Active", tone: "bg-emerald-500/10 text-emerald-700" };
  };

  const filtered = items.filter(c => !q || c.code.toLowerCase().includes(q.toLowerCase()) || (c.description ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Ticket className="size-6 text-primary" />
            {lang === "ar" ? "كوبونات الخصم" : "Coupons"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} {lang === "ar" ? "كوبون" : "coupons"}</p>
        </div>
        <div className="flex gap-2 items-center w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === "ar" ? "بحث" : "Search"} className="ps-9" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground hidden sm:inline-flex">
                <Plus className="me-2 size-4" />{lang === "ar" ? "كوبون جديد" : "New coupon"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{lang === "ar" ? "كوبون جديد" : "New coupon"}</DialogTitle></DialogHeader>
              <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "الكود" : "Code"} *</Label>
                  <Input dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" required maxLength={40} />
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "نوع الخصم" : "Discount type"}</Label>
                  <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">{lang === "ar" ? "نسبة %" : "Percentage %"}</SelectItem>
                      <SelectItem value="fixed">{lang === "ar" ? "مبلغ ثابت" : "Fixed amount"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "قيمة الخصم" : "Discount value"} *</Label>
                  <Input type="number" min="0" step="0.01" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "حد أقصى للخصم" : "Max discount"}</Label>
                  <Input type="number" min="0" step="0.01" value={form.max_discount_amount} onChange={(e) => setForm({ ...form, max_discount_amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "أقل قيمة فاتورة" : "Min order amount"}</Label>
                  <Input type="number" min="0" step="0.01" value={form.min_order_amount} onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "حد الاستخدام" : "Usage limit"}</Label>
                  <Input type="number" min="1" step="1" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "من تاريخ" : "Starts"}</Label>
                  <Input type="date" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "إلى تاريخ" : "Ends"}</Label>
                  <Input type="date" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{lang === "ar" ? "الوصف" : "Description"}</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label>{lang === "ar" ? "نشط" : "Active"}</Label>
                </div>
                <DialogFooter className="sm:col-span-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
                  <Button type="submit" className="gradient-primary text-primary-foreground">{lang === "ar" ? "حفظ" : "Save"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="shadow-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground">...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{lang === "ar" ? "لا توجد كوبونات" : "No coupons yet"}</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((c) => {
              const s = statusOf(c);
              return (
                <div key={c.id} className="flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/40">
                  <div className="size-11 rounded-full gradient-primary text-primary-foreground flex items-center justify-center shrink-0">
                    <Ticket className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold font-mono truncate">{c.code}</div>
                      <Badge variant="outline" className={s.tone}>{s.label}</Badge>
                    </div>
                    <div className="text-[13px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span>{c.discount_type === "percent" ? `${c.discount_value}%` : `${c.discount_value} ${lang === "ar" ? "ج.م" : "EGP"}`}</span>
                      {c.usage_limit != null && <span>{c.usage_count}/{c.usage_limit}</span>}
                      {c.ends_at && <span>{lang === "ar" ? "ينتهي" : "ends"} {c.ends_at}</span>}
                      {c.description && <span className="truncate">{c.description}</span>}
                    </div>
                  </div>
                  <Switch checked={c.is_active} onCheckedChange={() => toggle(c)} />
                  <Button variant="ghost" size="icon" className="text-destructive size-10" onClick={() => setDel(c)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Fab ariaLabel={lang === "ar" ? "كوبون جديد" : "New coupon"} onClick={() => setOpen(true)}>
        <Plus className="size-6" />
      </Fab>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "ar" ? "حذف الكوبون" : "Delete coupon"}</AlertDialogTitle>
            <AlertDialogDescription>{lang === "ar" ? "لا يمكن التراجع." : "This cannot be undone."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={() => del && remove(del)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {lang === "ar" ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}