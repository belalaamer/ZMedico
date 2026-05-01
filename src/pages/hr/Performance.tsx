import { useEffect, useState } from "react";
import { Plus, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

export default function Performance() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ staff_id: "", review_period_start: "", review_period_end: "", rating: 3, strengths_en: "", areas_for_improvement_en: "", goals_en: "", reviewer_comments: "" });

  const load = async () => {
    const { data } = await supabase.from("performance_reviews").select("*").order("created_at", { ascending: false });
    setItems(data ?? []);
    const { data: s } = await supabase.from("staff_profiles").select("id,employee_id");
    setStaff(s ?? []);
    const { data: p } = await supabase.from("profiles").select("id,full_name,email");
    setProfiles(p ?? []);
  };
  useEffect(() => { load(); }, []);

  const profName = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? id;

  const save = async () => {
    if (!form.staff_id || !form.review_period_start || !form.review_period_end) { toast.error("Fill all fields"); return; }
    const { error } = await supabase.from("performance_reviews").insert({ ...form, reviewer_id: user?.id });
    if (error) return toast.error(error.message);
    toast.success(t("save")); setOpen(false); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("performanceReviews")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4" />{t("addReview")}</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("addReview")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2"><Label>{t("staff")}</Label>
                <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("selectStaff")} /></SelectTrigger>
                  <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{profName(s.id)} · {s.employee_id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>{t("startDate")}</Label><Input type="date" value={form.review_period_start} onChange={(e) => setForm({ ...form, review_period_start: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t("endDate")}</Label><Input type="date" value={form.review_period_end} onChange={(e) => setForm({ ...form, review_period_end: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>{t("rating")} (1-5)</Label><Input type="number" min={1} max={5} value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>{t("strengths")}</Label><Textarea value={form.strengths_en} onChange={(e) => setForm({ ...form, strengths_en: e.target.value })} rows={2} /></div>
              <div className="space-y-2"><Label>{t("areasForImprovement")}</Label><Textarea value={form.areas_for_improvement_en} onChange={(e) => setForm({ ...form, areas_for_improvement_en: e.target.value })} rows={2} /></div>
              <div className="space-y-2"><Label>{t("goals")}</Label><Textarea value={form.goals_en} onChange={(e) => setForm({ ...form, goals_en: e.target.value })} rows={2} /></div>
              <div className="space-y-2"><Label>{t("reviewerComments")}</Label><Textarea value={form.reviewer_comments} onChange={(e) => setForm({ ...form, reviewer_comments: e.target.value })} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="shadow-card overflow-hidden">
        {items.length === 0 ? <div className="p-10 text-center text-muted-foreground">—</div> : (
          <div className="divide-y divide-border">
            {items.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{profName(r.staff_id)}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(r.review_period_start, lang)} → {formatDate(r.review_period_end, lang)}</div>
                </div>
                <Badge variant="outline" className="flex items-center gap-1"><Star className="size-3 fill-current" />{r.rating}/5</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}