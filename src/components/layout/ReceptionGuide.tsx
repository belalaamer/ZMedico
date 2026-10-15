import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { useState } from "react";

export function ReceptionGuide() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const { currentBranchId } = useBranch();
  const { authz, loading } = useAuthorization("ReceptionGuide");
  const [open, setOpen] = useState(false);
  const steps = [
    { permission: "patients.view", path: "/patients", title: ar ? "١. ابحث عن المريض أولًا" : "1. Find the patient first", text: ar ? "ابحث بالاسم أو الهاتف لتجنب إنشاء ملف مكرر. الإضافة تتطلب صلاحية إنشاء مريض." : "Search by name or phone to avoid duplicates. Creating a patient requires create permission." },
    { permission: "appointments.view", path: "/calendar", title: ar ? "٢. راجع الموعد" : "2. Check the appointment", text: ar ? "تأكد من الفرع والخدمة والطبيب والتاريخ قبل تأكيد الحجز." : "Check the branch, service, doctor and date before confirming." },
    { permission: "appointments.view", path: "/queue", title: ar ? "٣. تابع الطابور" : "3. Follow the queue", text: ar ? "راجع حالة الزيارة قبل الاستدعاء أو الإنهاء، ولا تكرر الإجراء أثناء التحميل." : "Check the visit status before calling or finishing. Do not repeat an action while it is loading." },
    { permission: "treasury.view", path: "/treasury", title: ar ? "٤. راجع التحصيل" : "4. Review collections", text: ar ? "راجع المبلغ وطريقة الدفع والخزينة. لا تكرر الدفع قبل التحقق من نتيجة العملية السابقة." : "Check the amount, payment method and treasury. Verify the previous result before retrying a payment." },
  ].filter(step => authz.can(step.permission));
  if (loading || !steps.length) return null;
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" size="sm" className="shrink-0" aria-label={ar ? "دليل الاستقبال" : "Reception guide"}><span className="sm:hidden">?</span><span className="hidden sm:inline">{ar ? "دليل الاستقبال" : "Reception guide"}</span></Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{ar ? "دليل الاستقبال السريع" : "Quick reception guide"}</DialogTitle><DialogDescription>{ar ? "اختر الفرع الصحيح أولًا. تظهر الروابط وفق صلاحياتك الحالية." : "Select the correct branch first. Links follow your current permissions."}</DialogDescription></DialogHeader>
      {steps.map(step => <section key={step.path} className="space-y-2 border-b pb-3"><h3 className="font-semibold">{step.title}</h3><p className="text-sm text-muted-foreground">{step.text}</p><Button asChild variant="secondary" size="sm"><Link onClick={() => setOpen(false)} to={currentBranchId ? `${step.path}?branch=${encodeURIComponent(currentBranchId)}` : step.path}>{ar ? "فتح الشاشة" : "Open screen"}</Link></Button></section>)}
    </DialogContent>
  </Dialog>;
}
