import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, Loader2, Mail, Phone, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type RequestRow = { id: string; clinic_name: string; owner_name: string; email: string; phone: string | null; plan_id: string | null; plan_name_en: string | null; plan_name_ar: string | null; message: string | null; status: string; notes: string | null; created_at: string; updated_at: string };

function statusLabel(status: string, isAr: boolean) {
  const labels: Record<string, string> = { pending: isAr ? "جديد" : "Pending", contacted: isAr ? "تم التواصل" : "Contacted", approved: isAr ? "مقبول" : "Approved", rejected: isAr ? "مرفوض" : "Rejected", closed: isAr ? "مغلق" : "Closed" };
  return labels[status] ?? status;
}

export default function SubscriptionRequestsPanel() {
  const { lang } = useI18n();
  const { toast } = useToast();
  const isAr = lang === "ar";
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("platform_list_subscription_requests" as never, { p_status: status } as never);
    if (error) toast({ title: isAr ? "تعذر تحميل طلبات الاشتراك" : "Unable to load subscription requests", variant: "destructive" });
    setRows((data ?? []) as RequestRow[]);
    setLoading(false);
  }, [isAr, status, toast]);

  useEffect(() => { void load(); }, [load]);

  const updateRequest = async (id: string, nextStatus: string) => {
    setUpdating(id);
    const { error } = await supabase.rpc("platform_update_subscription_request" as never, { p_request_id: id, p_status: nextStatus, p_notes: null } as never);
    setUpdating(null);
    if (error) {
      toast({ title: isAr ? "تعذر تحديث الطلب" : "Unable to update request", variant: "destructive" });
      return;
    }
    toast({ title: isAr ? "تم تحديث حالة الطلب" : "Request status updated" });
    await load();
  };

  return <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="size-4 text-primary" />{isAr ? "طلبات الاشتراك" : "Subscription requests"}</CardTitle><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[145px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">{statusLabel("pending", isAr)}</SelectItem><SelectItem value="contacted">{statusLabel("contacted", isAr)}</SelectItem><SelectItem value="approved">{statusLabel("approved", isAr)}</SelectItem><SelectItem value="rejected">{statusLabel("rejected", isAr)}</SelectItem><SelectItem value="closed">{statusLabel("closed", isAr)}</SelectItem><SelectItem value="all">{isAr ? "كل الطلبات" : "All requests"}</SelectItem></SelectContent></Select></CardHeader><CardContent>{loading ? <div className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="me-2 inline size-4 animate-spin" />{isAr ? "جارٍ التحميل…" : "Loading…"}</div> : rows.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{isAr ? "لا توجد طلبات في هذه الحالة." : "No requests in this status."}</div> : <div className="space-y-3">{rows.map((row) => <div key={row.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{row.clinic_name}</span><Badge variant={row.status === "pending" ? "default" : "secondary"}>{statusLabel(row.status, isAr)}</Badge></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />{row.owner_name}</span><span className="inline-flex items-center gap-1"><Mail className="size-3.5" />{row.email}</span>{row.phone ? <span className="inline-flex items-center gap-1" dir="ltr"><Phone className="size-3.5" />{row.phone}</span> : null}</div><p className="mt-2 text-xs text-muted-foreground">{isAr ? "الخطة المفضلة: " : "Preferred plan: "}{isAr ? row.plan_name_ar ?? "لم يحدد" : row.plan_name_en ?? "Not specified"} · {new Date(row.created_at).toLocaleString(isAr ? "ar-EG" : "en-EG")}</p>{row.message ? <p className="mt-2 text-sm leading-6">{row.message}</p> : null}</div><div className="flex shrink-0 flex-wrap gap-2">{row.status === "pending" ? <Button size="sm" variant="outline" onClick={() => void updateRequest(row.id, "contacted")} disabled={updating === row.id}>{updating === row.id ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}{isAr ? "تم التواصل" : "Mark contacted"}</Button> : null}{["pending", "contacted"].includes(row.status) ? <Button size="sm" onClick={() => void updateRequest(row.id, "approved")} disabled={updating === row.id}><Check className="me-1 size-3.5" />{isAr ? "موافقة" : "Approve"}</Button> : null}{["pending", "contacted"].includes(row.status) ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void updateRequest(row.id, "rejected")} disabled={updating === row.id}><X className="me-1 size-3.5" />{isAr ? "رفض" : "Reject"}</Button> : null}</div></div></div>)}</div>}</CardContent></Card>;
}
