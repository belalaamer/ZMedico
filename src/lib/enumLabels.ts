import type { Database } from "@/integrations/supabase/types";

type E<K extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][K];

// Arabic words for the values Postgres stores, so a desk working in Arabic never
// reads `in_progress` or `ct_scan`. English keeps the stored value exactly as the
// screens shipped it: the maps are Arabic-only on purpose, the same shape
// PhysioCaseDetail.tsx and PhysioCases.tsx already use, so switching a badge to
// this module cannot change what the English desk sees.
//
// Each map is declared as Record<its own enum domain, string>, so `tsc` — not a
// regex — proves every stored value has a word. Add a label to the Postgres enum
// and every screen that renders it stops compiling until the desk has a name for
// it, which is the failure mode wanted here.
//
// Copy is reused, not invented: words come from the same concepts already in
// i18n.ts (statusPaid, statusPresent, fullTime, male/female) and from the Arabic
// already shipped on the physio screens. Where a value names a feminine noun
// (الحالة, الفاتورة, الخطة, الروشتة) the adjective agrees with that noun, so
// staff_status says نشط while physio_case_status says نشطة — grammar, not drift.

const APPOINTMENT_STATUS: Record<E<"appointment_status">, string> = {
  scheduled: "مجدول",
  confirmed: "مؤكد",
  in_progress: "جارٍ",
  completed: "مكتمل",
  cancelled: "ملغي",
  no_show: "لم يحضر",
  departed: "غادر",
};

const ATTENDANCE_STATUS: Record<E<"attendance_status">, string> = {
  present: "حاضر",
  absent: "غائب",
  late: "متأخر",
  early_leave: "انصراف مبكر",
  half_day: "نصف يوم",
  on_leave: "في إجازة",
};

const COMMISSION_STATUS: Record<E<"commission_status">, string> = {
  pending: "قيد الانتظار",
  partial: "جزئية",
  earned: "مستحقة",
  paid: "مدفوعة",
  cancelled: "ملغاة",
};

const CONTRACT_TYPE: Record<E<"contract_type">, string> = {
  full_time: "دوام كامل",
  part_time: "دوام جزئي",
  contract: "عقد",
  freelance: "مستقل",
};

const DOCUMENT_TYPE: Record<E<"document_type">, string> = {
  lab_result: "تحليل معمل",
  xray: "أشعة سينية",
  mri: "رنين مغناطيسي",
  ct_scan: "أشعة مقطعية",
  prescription: "روشتة",
  report: "تقرير",
  other: "أخرى",
};

const GENDER: Record<E<"gender">, string> = {
  male: "ذكر",
  female: "أنثى",
};

const INVOICE_STATUS: Record<E<"invoice_status">, string> = {
  draft: "مسودة",
  pending: "قيد الانتظار",
  paid: "مدفوعة",
  partial: "جزئية",
  cancelled: "ملغاة",
};

const LEAVE_REQUEST_STATUS: Record<E<"leave_request_status">, string> = {
  pending: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

const MEDICAL_RECORD_STATUS: Record<E<"medical_record_status">, string> = {
  draft: "مسودة",
  completed: "مكتمل",
  reviewed: "مراجع",
};

const PAYROLL_STATUS: Record<E<"payroll_status">, string> = {
  draft: "مسودة",
  approved: "مقبول",
  paid: "مدفوع",
};

const PHYSIO_ATTENDANCE: Record<E<"physio_attendance">, string> = {
  scheduled: "مجدولة",
  done: "تمت",
  missed: "لم تحضر",
  cancelled: "ملغاة",
};

const PHYSIO_CASE_STATUS: Record<E<"physio_case_status">, string> = {
  active: "نشطة",
  paused: "متوقفة",
  completed: "مكتملة",
  cancelled: "ملغاة",
};

const PHYSIO_TREND: Record<E<"physio_trend">, string> = {
  improving: "في تحسن",
  unchanged: "بدون تغيير",
  worsening: "في تدهور",
};

const PRESCRIPTION_STATUS: Record<E<"prescription_status">, string> = {
  active: "سارية",
  completed: "منتهية",
  cancelled: "ملغاة",
};

const REMINDER_CHANNEL: Record<E<"reminder_channel">, string> = {
  sms: "رسالة نصية",
  email: "بريد إلكتروني",
  whatsapp: "واتساب",
  push: "إشعار التطبيق",
};

const STAFF_STATUS: Record<E<"staff_status">, string> = {
  active: "نشط",
  on_leave: "في إجازة",
  terminated: "منتهي",
  suspended: "موقوف",
};

const VISIT_TYPE: Record<E<"visit_type">, string> = {
  consultation: "استشارة",
  follow_up: "متابعة",
  procedure: "إجراء",
  emergency: "طوارئ",
};

// The two operator badges the C17 sweep found outside the clinic desks. Labels
// come from the live enum arrays: inventory_tx_type
// (purchase, sale, adjustment, transfer_in, transfer_out, return, expiry) and
// report_format (pdf, excel, both).
const INVENTORY_TX_TYPE: Record<E<"inventory_tx_type">, string> = {
  purchase: "شراء",
  sale: "صرف",
  adjustment: "تسوية جرد",
  transfer_in: "تحويل وارد",
  transfer_out: "تحويل صادر",
  return: "مرتجع",
  expiry: "انتهاء صلاحية",
};

const REPORT_FORMAT: Record<E<"report_format">, string> = {
  pdf: "PDF",
  excel: "Excel",
  both: "الصيغتان",
};

// patient_portal_accounts.status and treatment_plans.status are `text` with a
// CHECK, not Postgres enums, so the generated types carry no union for them and
// the domain is written here. Both arrays were read from the live constraint on
// 2026-10-28: status = ANY (ARRAY['pending','active','disabled']) and
// (ARRAY['active','completed','cancelled','paused']).
export type PortalAccountStatus = "pending" | "active" | "disabled";
const PORTAL_ACCOUNT_STATUS: Record<PortalAccountStatus, string> = {
  pending: "قيد الانتظار",
  active: "مفعّل",
  disabled: "معطّل",
};

export type TreatmentPlanStatus = "active" | "completed" | "cancelled" | "paused";
const TREATMENT_PLAN_STATUS: Record<TreatmentPlanStatus, string> = {
  active: "نشطة",
  completed: "مكتملة",
  cancelled: "ملغاة",
  paused: "متوقفة",
};

// Same story for the two operator-facing screens found by the C17 sweep: both
// columns are `text` with a CHECK, read live on 2026-10-28.
export type FollowupStatus = "pending" | "completed" | "skipped" | "cancelled";
const FOLLOWUP_STATUS: Record<FollowupStatus, string> = {
  pending: "قيد الانتظار",
  completed: "مكتملة",
  skipped: "تم تخطيها",
  cancelled: "ملغاة",
};

export type DomainStatus = "pending" | "active" | "disabled" | "failed";
const DOMAIN_STATUS: Record<DomainStatus, string> = {
  pending: "قيد الانتظار",
  active: "مفعّل",
  disabled: "معطّل",
  failed: "فشل",
};

const LABELS = {
  appointment_status: APPOINTMENT_STATUS,
  attendance_status: ATTENDANCE_STATUS,
  commission_status: COMMISSION_STATUS,
  contract_type: CONTRACT_TYPE,
  document_type: DOCUMENT_TYPE,
  gender: GENDER,
  invoice_status: INVOICE_STATUS,
  leave_request_status: LEAVE_REQUEST_STATUS,
  medical_record_status: MEDICAL_RECORD_STATUS,
  payroll_status: PAYROLL_STATUS,
  physio_attendance: PHYSIO_ATTENDANCE,
  physio_case_status: PHYSIO_CASE_STATUS,
  physio_trend: PHYSIO_TREND,
  prescription_status: PRESCRIPTION_STATUS,
  reminder_channel: REMINDER_CHANNEL,
  report_format: REPORT_FORMAT,
  staff_status: STAFF_STATUS,
  visit_type: VISIT_TYPE,
  inventory_tx_type: INVENTORY_TX_TYPE,
  portal_account_status: PORTAL_ACCOUNT_STATUS,
  treatment_plan_status: TREATMENT_PLAN_STATUS,
  followup_status: FOLLOWUP_STATUS,
  domain_status: DOMAIN_STATUS,
};

export type EnumDomain = keyof typeof LABELS;

export function enumLabel(
  domain: EnumDomain,
  value: string | null | undefined,
  lang: string
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (lang !== "ar") return value;
  return (LABELS[domain] as Record<string, string>)[value] ?? value;
}
