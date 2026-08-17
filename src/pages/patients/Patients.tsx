import { useEffect, useState } from "react";
import { useDataSync } from "@/lib/dataSync";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Phone, Mail, MapPin, MoreHorizontal, Calendar as CalendarIcon, FileText, Eye, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { Can } from "@/components/Can";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { ListSkeleton } from "@/components/ListSkeleton";
import { Fab } from "@/components/ui/fab";
import { ReferrerPicker } from "./ReferrerPicker";
import { PullToRefresh } from "@/components/PullToRefresh";
import { TablePager } from "@/components/TablePager";
import { CreateInvoiceDialog } from "../invoices/CreateInvoiceDialog";
import { containsArabicScript, patientDisplayDirection, patientDisplayName } from "@/lib/patientName";

const PAGE_SIZE = 50;

type Patient = {
  id: string;
  patient_code: number;
  first_name_en: string;
  last_name_en: string | null;
  first_name_ar: string | null;
  last_name_ar: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  gender: "male" | "female" | null;
  city: string | null;
  address: string | null;
  dob: string | null;
  blood_type: string | null;
  notes: string | null;
  branch_id: string | null;
  created_at: string;
  name_language: "ar" | "en" | null;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  phone: z.string().trim().min(1, "Phone is required").max(30),
  phone2: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  dob: z.string().optional(),
  // Empty Select values must be normalized before validation; the database accepts NULL.
  gender: z.preprocess((value) => value === "" ? undefined : value, z.enum(["male", "female"]).optional()),
  blood_type: z.string().trim().max(10).optional(),
  address: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export default function PatientsPage() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const navigate = useNavigate();
  // R2: canonical authorization entry point.
  const { authz } = useAuthorization("Patients");
  const [items, setItems] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Patient | null>(null);
  const [duesByPatient, setDuesByPatient] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [invoiceForPatient, setInvoiceForPatient] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", phone: "", phone2: "", email: "",
    dob: "", gender: "" as "" | "male" | "female",
    blood_type: "", address: "", notes: "",
    referred_by_patient_id: null as string | null,
  });

  const load = async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    // RBAC-11 / UX fix: sort by patient_code (a guaranteed strictly-
    // increasing, never-reused sequence assigned by tg_patient_assign_code)
    // instead of created_at. Previously the list was ordered by created_at,
    // which does not always correspond to the visible "#N" numbering shown
    // per row (e.g. batches of older records inserted later than newer-
    // numbered ones) -- so a user scanning the numbered list saw the
    // numbers jump around non-sequentially. patient_code descending gives
    // the same "most recently registered first" ordering intent while
    // guaranteeing the visible numbers are always in consistent order.
    let query = supabase.from("patients")
      .select("id,patient_code,first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,phone,phone2,email,gender,city,address,dob,blood_type,notes,branch_id,created_at", { count: "exact" })
      .is("deleted_at", null).order("patient_code", { ascending: false }).range(from, to);
    if (currentBranchId) query = query.eq("branch_id", currentBranchId);
    const { data, error, count } = await query;
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Patient[]);
    setTotal(count ?? 0);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId, page]);
  useEffect(() => { setPage(0); }, [currentBranchId]);
  useDataSync(["patients"], () => { load(); });

  // Lightweight batched outstanding-debt badge: a single query for the visible
  // patients, no per-row work, no joins.
  useEffect(() => {
    if (!items.length) { setDuesByPatient({}); return; }
    let active = true;
    const ids = items.map((p) => p.id);
    (async () => {
      let q = supabase
        .from("invoices")
        .select("patient_id,total,paid_amount,status,deleted_at")
        .in("patient_id", ids)
        .is("deleted_at", null)
        .in("status", ["pending", "partial"]);
      const { data } = await q;
      if (!active) return;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) {
        const due = Number(r.total || 0) - Number(r.paid_amount || 0);
        if (due > 0.009) map[r.patient_id] = (map[r.patient_id] ?? 0) + due;
      }
      setDuesByPatient(map);
    })();
    return () => { active = false; };
  }, [items]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Please check the form"); return; }
    const d = parsed.data;
    const payload: any = {
      first_name_en: d.name,
      first_name_ar: d.name,
      name_language: containsArabicScript(d.name) ? "ar" : "en",
      phone: d.phone,
      phone2: d.phone2 || null,
      email: d.email || null,
      dob: d.dob || null,
      gender: d.gender || null,
      blood_type: d.blood_type || null,
      address: d.address || null,
      notes: d.notes || null,
      branch_id: currentBranchId,
      referred_by_patient_id: form.referred_by_patient_id || null,
    };
    const { error } = await supabase.from("patients").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تمت إضافة المريض" : "Patient added");
    setOpen(false);
    setForm({ name: "", phone: "", phone2: "", email: "", dob: "", gender: "", blood_type: "", address: "", notes: "", referred_by_patient_id: null });
    load();
  };

  const handleDelete = async (p: Patient) => {
    const { error } = await supabase.from("patients").update({ deleted_at: new Date().toISOString() } as any).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم حذف المريض" : "Patient deleted");
    setConfirmDel(null);
    load();
  };

  const filtered = items.filter((p) => {
    if (!q) return true;
    const n = `${p.first_name_en} ${p.last_name_en ?? ""} ${p.first_name_ar ?? ""} ${p.last_name_ar ?? ""} ${p.phone ?? ""} ${p.email ?? ""}`.toLowerCase();
    return n.includes(q.toLowerCase());
  });

  return (
    <PullToRefresh onRefresh={load}>
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("patients")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} {t("patients").toLowerCase()}</p>
        </div>
        <div className="flex gap-2 items-center w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="ps-9" />
          </div>
          <Can permission="patients.create">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  className="gradient-primary text-primary-foreground min-h-11"
                  aria-label={t("addPatient")}
                >
                  <Plus className="me-2 size-4" />
                  <span className="hidden xs:inline sm:inline">{t("addPatient")}</span>
                  <span className="sm:hidden">{t("addPatient")}</span>
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("newPatient")}</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("fullName")} *</Label>
                  <Input dir="auto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={160} placeholder={t("fullName")} />
                </div>
                <div className="space-y-2">
                  <Label>{t("phone")} *</Label>
                  <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="+20..." maxLength={30} />
                </div>
                <div className="space-y-2">
                  <Label>{t("phone2")}</Label>
                  <Input dir="ltr" value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} maxLength={30} />
                </div>
                <div className="space-y-2">
                  <Label>{t("email")}</Label>
                  <Input dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
                </div>
                <div className="space-y-2">
                  <Label>{t("dob")}</Label>
                  <Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t("gender")}</Label>
                  <Select value={form.gender || "none"} onValueChange={(v) => setForm({ ...form, gender: v === "none" ? "" : v as any })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— {t("none")} —</SelectItem>
                      <SelectItem value="male">{t("male")}</SelectItem>
                      <SelectItem value="female">{t("female")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("bloodType")}</Label>
                  <Select value={form.blood_type} onValueChange={(v) => setForm({ ...form, blood_type: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("address")}</Label>
                  <Input dir="auto" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={255} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("referredByPatient")}</Label>
                  <ReferrerPicker
                    value={form.referred_by_patient_id}
                    onChange={(v) => setForm({ ...form, referred_by_patient_id: v })}
                    branchId={currentBranchId}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("notes")}</Label>
                  <Textarea dir="auto" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={1000} />
                </div>
                <DialogFooter className="sm:col-span-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                  <Button type="submit" className="gradient-primary text-primary-foreground">{t("save")}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
            </Dialog>
          </Can>
        </div>
      </div>

      <Card className="shadow-card overflow-hidden">
        {loading ? (
          <ListSkeleton rows={8} />
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("noPatients")}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">{lang === "ar" ? "المريض" : "Patient"}</TableHead>
                  <TableHead className="hidden md:table-cell">{lang === "ar" ? "التواصل" : "Contact"}</TableHead>
                  <TableHead className="hidden lg:table-cell">{lang === "ar" ? "الحالة المالية" : "Financial Status"}</TableHead>
                  <TableHead className="w-[60px] text-end"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const name = patientDisplayName(p, lang);
                  const nameDir = patientDisplayDirection(p, lang);
                  const due = duesByPatient[p.id] ?? 0;
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/40">
                      <TableCell className="min-w-0 p-2 sm:p-3">
                        <Link to={`/patients/${p.id}`} className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <div aria-hidden="true" className="size-9 sm:size-10 rounded-full gradient-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">
                            {name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                              <span dir={nameDir} className="font-semibold truncate text-sm sm:text-[15px]">{name}</span>
                              <Badge variant="outline" className="text-[10px] leading-4 px-1.5 shrink-0">#{p.patient_code}</Badge>
                            </div>
                            <div className="md:hidden text-xs text-muted-foreground truncate mt-0.5">
                              {p.phone || p.email || "—"}
                            </div>
                            {due > 0 && <Badge className="md:hidden mt-1 text-[10px] leading-4 px-1.5 bg-destructive/10 text-destructive border border-destructive/30 tabular-nums">
                              {lang === "ar" ? "متبقي" : "Due"} {due.toFixed(2)}
                            </Badge>}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell align-middle">
                        <div className="text-[13px] text-muted-foreground flex flex-col gap-0.5 min-w-0">
                          {p.phone && <span className="flex items-center gap-1.5 truncate"><Phone className="size-3 shrink-0" />{p.phone}</span>}
                          {p.email && <span className="flex items-center gap-1.5 truncate"><Mail className="size-3 shrink-0" />{p.email}</span>}
                          {p.city && <span className="flex items-center gap-1.5 truncate"><MapPin className="size-3 shrink-0" />{p.city}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell align-middle">
                        {due > 0 ? (
                          <Badge className="bg-destructive/10 text-destructive border border-destructive/30 tabular-nums hover:bg-destructive/15">
                            {lang === "ar" ? "متبقي" : "Due"} {due.toFixed(2)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            {lang === "ar" ? "مسدد" : "Cleared"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-end align-middle">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-9" aria-label="Actions">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => navigate(`/patients/${p.id}`)}>
                              <Eye className="size-4 me-2" /> {lang === "ar" ? "عرض الملف" : "View Profile"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/calendar?patient_id=${p.id}`)}>
                              <CalendarIcon className="size-4 me-2" /> {lang === "ar" ? "حجز موعد" : "Book Appointment"}
                            </DropdownMenuItem>
                            {authz.can("invoices.create") && (
                              <DropdownMenuItem onClick={() => setInvoiceForPatient(p.id)}>
                                <FileText className="size-4 me-2" /> {lang === "ar" ? "إنشاء فاتورة" : "Create Invoice"}
                              </DropdownMenuItem>
                            )}
                            {authz.can("patients.delete") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setConfirmDel(p)}
                                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                >
                                  <Trash2 className="size-4 me-2" /> {lang === "ar" ? "حذف" : "Delete"}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <TablePager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </Card>

      <Can permission="patients.create">
        <Fab ariaLabel={t("addPatient")} onClick={() => setOpen(true)}>
          <Plus className="size-6" />
        </Fab>
      </Can>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "ar" ? "حذف المريض" : "Delete patient"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? "هل أنت متأكد من حذف هذا المريض؟ لا يمكن التراجع عن هذا الإجراء."
                : "Are you sure you want to delete this patient? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && handleDelete(confirmDel)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {lang === "ar" ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateInvoiceDialog
        open={!!invoiceForPatient}
        onOpenChange={(o) => !o && setInvoiceForPatient(null)}
        presetPatientId={invoiceForPatient ?? undefined}
        onSaved={() => setInvoiceForPatient(null)}
      />
    </div>
    </PullToRefresh>
  );
}
