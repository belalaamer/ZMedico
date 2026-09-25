export type ClinicModuleKey =
  | "dashboard"
  | "patients"
  | "appointments"
  | "medical"
  | "invoices"
  | "reports"
  | "communication"
  | "physio"
  | "dermatology"
  | "orthopedics"
  | "dental"
  | "inventory"
  | "hr"
  | "marketing";

export type ClinicModuleDefinition = {
  key: ClinicModuleKey;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  group: "core" | "specialty" | "business";
  alwaysOn?: boolean;
};

export const CLINIC_MODULES: ClinicModuleDefinition[] = [
  { key: "dashboard", nameAr: "لوحة التحكم", nameEn: "Dashboard", descriptionAr: "ملخص تشغيل العيادة", descriptionEn: "Clinic operating summary", group: "core", alwaysOn: true },
  { key: "patients", nameAr: "المرضى", nameEn: "Patients", descriptionAr: "ملفات المرضى والبيانات الأساسية", descriptionEn: "Patient records and demographics", group: "core", alwaysOn: true },
  { key: "appointments", nameAr: "المواعيد", nameEn: "Appointments", descriptionAr: "الحجز والتقويم والطابور", descriptionEn: "Booking, calendar and queue", group: "core", alwaysOn: true },
  { key: "medical", nameAr: "الملفات الطبية", nameEn: "Medical records", descriptionAr: "السجلات والاستشارات والوصفات", descriptionEn: "Records, consultations and prescriptions", group: "core", alwaysOn: true },
  { key: "invoices", nameAr: "الفوترة", nameEn: "Billing", descriptionAr: "الفواتير والمدفوعات والخزينة", descriptionEn: "Invoices, payments and treasury", group: "core", alwaysOn: true },
  { key: "reports", nameAr: "التقارير المتقدمة", nameEn: "Advanced reports", descriptionAr: "تقارير التشغيل والماليات المتقدمة", descriptionEn: "Advanced operational and financial reports", group: "core" },
  { key: "communication", nameAr: "التواصل", nameEn: "Communication", descriptionAr: "التذكيرات وقنوات الرسائل", descriptionEn: "Reminders and messaging channels", group: "core", alwaysOn: true },
  { key: "physio", nameAr: "العلاج الطبيعي", nameEn: "Physiotherapy", descriptionAr: "الحالات والجلسات والمتابعات", descriptionEn: "Cases, sessions and follow-ups", group: "specialty" },
  { key: "dermatology", nameAr: "الجلدية", nameEn: "Dermatology", descriptionAr: "إجراءات الجلدية والزيارات", descriptionEn: "Dermatology visits and procedures", group: "specialty" },
  { key: "orthopedics", nameAr: "العظام", nameEn: "Orthopedics", descriptionAr: "ملفات وإجراءات العظام", descriptionEn: "Orthopedic records and procedures", group: "specialty" },
  { key: "dental", nameAr: "الأسنان", nameEn: "Dental", descriptionAr: "مخطط الأسنان والإجراءات", descriptionEn: "Dental charting and procedures", group: "specialty" },
  { key: "inventory", nameAr: "المخزون", nameEn: "Inventory", descriptionAr: "الأصناف والموردون وأوامر الشراء", descriptionEn: "Products, suppliers and purchasing", group: "business" },
  { key: "hr", nameAr: "الموارد البشرية", nameEn: "HR & Staff", descriptionAr: "الموظفون والحضور والرواتب", descriptionEn: "Staff, attendance and payroll", group: "business" },
  { key: "marketing", nameAr: "التسويق", nameEn: "Marketing", descriptionAr: "العملاء المحتملون والحملات والتحليلات", descriptionEn: "Leads, campaigns and analytics", group: "business" },
];

export const DEFAULT_ENABLED_MODULES = CLINIC_MODULES.map((module) => module.key);

export function moduleDefinition(key: string) {
  return CLINIC_MODULES.find((module) => module.key === key);
}


/** Maps protected application paths to tenant-level module entitlements. */
export function moduleKeyForPath(path: string): ClinicModuleKey | null {
  if (path.startsWith("/physio")) return "physio";
  if (path.startsWith("/inventory")) return "inventory";
  if (path.startsWith("/hr")) return "hr";
  if (path.startsWith("/leads")) return "marketing";
  if (path.startsWith("/settings/communication")) return "communication";
  if (path.startsWith("/patients/") && path.split("/")[3] === "dental") return "dental";
  if (path.startsWith("/patients")) return "patients";
  if (path.startsWith("/calendar") || path.startsWith("/queue") || path.startsWith("/appointments") || path.startsWith("/reminders")) return "appointments";
  if (path.startsWith("/invoices") || path.startsWith("/payments") || path.startsWith("/treasury") || path.startsWith("/expenses") || path.startsWith("/coupons")) return "invoices";
  if (path.startsWith("/reports")) return "reports";
  if (path.startsWith("/medical")) return "medical";
  return null;
}
