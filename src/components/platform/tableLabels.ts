/**
 * Human names for the relations the deletion engine reports. The engine speaks in table
 * names because it walks pg_constraint; the operator reads Arabic. A table missing from
 * this map still renders — its identifier is shown in mono inside an Arabic sentence —
 * so a new relation can never turn the blocker list into English prose.
 */
const LABELS: Record<string, readonly [string, string]> = {
  branches: ["الفروع", "Branches"],
  platform_change_log: ["سجل تغييرات المنصة", "Platform change log"],
  subscription_change_log: ["سجل تغييرات الاشتراك", "Subscription change log"],
  subscription_requests: ["طلبات الاشتراك", "Subscription requests"],
  subscriptions: ["الاشتراكات", "Subscriptions"],
  tenant_addons: ["الإضافات", "Add-ons"],
  tenant_branding: ["الهوية البصرية", "Branding"],
  tenant_module_settings: ["إعدادات الوحدات", "Module settings"],
  tenant_usage: ["سجل الاستخدام", "Usage records"],
  clinic_profile: ["ملف العيادة", "Clinic profile"],
  clinic_settings: ["إعدادات العيادة", "Clinic settings"],
  appointment_settings: ["إعدادات المواعيد", "Appointment settings"],
  notification_settings: ["إعدادات الإشعارات", "Notification settings"],
  queue_settings: ["إعدادات الطابور", "Queue settings"],
  invoice_settings: ["إعدادات الفواتير", "Invoice settings"],
  invoice_counters: ["عدادات الفواتير", "Invoice counters"],
  payment_methods: ["طرق الدفع", "Payment methods"],
  expense_categories: ["بنود المصروفات", "Expense categories"],
  coupons: ["القسائم", "Coupons"],
  stock_alerts: ["تنبيهات المخزون", "Stock alerts"],
  communication_templates: ["قوالب التواصل", "Communication templates"],
  email_templates: ["قوالب البريد", "Email templates"],
  sms_templates: ["قوالب الرسائل النصية", "SMS templates"],
  whatsapp_templates: ["قوالب واتساب", "WhatsApp templates"],
  allowed_signup_emails: ["البريد المسموح بالتسجيل", "Allowed signup emails"],
  doctor_service_assignments: ["ربط الأطباء بالخدمات", "Doctor service assignments"],
  service_consumables: ["مستهلكات الخدمات", "Service consumables"],
  booking_resource_services: ["خدمات موارد الحجز", "Booking resource services"],
  booking_resources: ["موارد الحجز", "Booking resources"],
  staff_branches: ["ربط الموظفين بالفروع", "Staff branch assignments"],
  staff_targets: ["مستهدفات الموظفين", "Staff targets"],
  work_schedules: ["جداول العمل", "Work schedules"],
  staff_positions: ["المسميات الوظيفية", "Staff positions"],
  departments: ["الأقسام", "Departments"],
  lead_pipeline_stages: ["مراحل مسار العملاء المحتملين", "Lead pipeline stages"],
  lead_lost_reasons: ["أسباب خسارة العملاء المحتملين", "Lead lost reasons"],
  loyalty_settings: ["إعدادات الولاء", "Loyalty settings"],
  ai_tenant_settings: ["إعدادات المساعد الذكي", "AI assistant settings"],
  ai_provider_config: ["إعدادات مزود الذكاء الاصطناعي", "AI provider configuration"],
  tenant_domains: ["الدومينات", "Domains"],
  reminders: ["التذكيرات", "Reminders"],
  treasury: ["الخزائن", "Tills"],
  custom_domain_rate_limits: ["حدود طلبات الدومين", "Custom domain rate limits"],
  login_rate_limits: ["حدود محاولات الدخول", "Login rate limits"],
  public_booking_rate_limits: ["حدود الحجز العام", "Public booking rate limits"],
  subscription_request_rate_limits: ["حدود طلبات الاشتراك", "Subscription request rate limits"],
  audit_logs: ["سجل التدقيق", "Audit trail"],
  phi_access_log: ["سجل الوصول للبيانات الصحية", "PHI access log"],
  client_errors: ["سجل أخطاء الواجهة", "Client error log"],
  ai_config_audit_log: ["سجل تغييرات إعدادات الذكاء الاصطناعي", "AI configuration audit trail"],
  patients: ["سجلات المرضى", "Patient records"],
  patient_documents: ["مستندات المرضى", "Patient documents"],
  patient_portal_accounts: ["حسابات بوابة المرضى", "Patient portal accounts"],
  patient_portal_settings: ["إعدادات بوابة المرضى", "Patient portal settings"],
  invoices: ["الفواتير", "Invoices"],
  invoice_items: ["بنود الفواتير", "Invoice lines"],
  payments: ["المدفوعات", "Payments"],
  medical_records: ["السجلات الطبية", "Medical records"],
  record_procedures: ["الإجراءات داخل السجل الطبي", "Procedures inside medical records"],
  record_diagnoses: ["التشخيصات داخل السجل الطبي", "Diagnoses inside medical records"],
  diagnoses: ["كتالوج التشخيصات", "Diagnosis catalog"],
  medical_history: ["التاريخ المرضي", "Medical history"],
  prescriptions: ["الروشتات", "Prescriptions"],
  prescription_items: ["بنود الروشتات", "Prescription lines"],
  vital_signs: ["العلامات الحيوية", "Vital signs"],
  dental_chart: ["مخطط الأسنان", "Dental chart"],
  appointments: ["المواعيد", "Appointments"],
  treatment_sessions: ["جلسات العلاج", "Treatment sessions"],
  treatment_plans: ["خطط العلاج", "Treatment plans"],
  physio_cases: ["حالات العلاج الطبيعي", "Physio cases"],
  physio_sessions: ["جلسات العلاج الطبيعي", "Physio sessions"],
  physio_reassessments: ["إعادة تقييم العلاج الطبيعي", "Physio reassessments"],
  attendance: ["الحضور والانصراف", "Attendance"],
  staff_profiles: ["سجلات الموظفين", "Staff records"],
  profiles: ["حسابات المستخدمين", "User accounts"],
  user_roles: ["أدوار المستخدمين", "User roles"],
  leave_requests: ["طلبات الإجازة", "Leave requests"],
  leave_types: ["أنواع الإجازات", "Leave types"],
  performance_reviews: ["تقييمات الأداء", "Performance reviews"],
  salary_adjustments: ["تعديلات الرواتب", "Salary adjustments"],
  payroll: ["مسيّرات الرواتب", "Payroll"],
  doctor_commissions: ["عمولات الأطباء", "Doctor commissions"],
  treasury_transactions: ["حركات الخزينة", "Treasury entries"],
  treasury_shifts: ["ورديات الخزينة", "Till shifts"],
  treasury_daily_closes: ["الإقفال اليومي", "Daily closes"],
  expenses: ["المصروفات", "Expenses"],
  inventory: ["المخزون", "Stock levels"],
  inventory_transactions: ["حركات المخزون", "Stock movements"],
  purchase_orders: ["أوامر الشراء", "Purchase orders"],
  purchase_order_items: ["بنود أوامر الشراء", "Purchase order lines"],
  suppliers: ["الموردون", "Suppliers"],
  products: ["كتالوج المنتجات", "Product catalog"],
  product_categories: ["تصنيفات المنتجات", "Product categories"],
  services: ["كتالوج الخدمات", "Service catalog"],
  service_categories: ["تصنيفات الخدمات", "Service categories"],
  procedures: ["كتالوج الإجراءات", "Procedure catalog"],
  medications: ["كتالوج الأدوية", "Medication catalog"],
  insurance_contracts: ["عقود التأمين", "Insurance contracts"],
  insurance_companies: ["شركات التأمين", "Insurance companies"],
  insurance_contract_rules: ["قواعد عقود التأمين", "Insurance contract rules"],
  patient_wallets: ["محافظ المرضى", "Patient wallets"],
  patient_wallet_transactions: ["حركات المحافظ", "Wallet movements"],
  coupon_redemptions: ["القسائم المستخدمة", "Coupon redemptions"],
  conversations: ["المحادثات", "Conversations"],
  messages: ["سجل الرسائل", "Message history"],
  channel_accounts: ["حسابات قنوات التواصل", "Messaging channel accounts"],
  notifications: ["الإشعارات", "Notifications"],
  queue_alerts: ["تنبيهات الطابور", "Queue alerts"],
  queue_alert_runs: ["تشغيلات تنبيهات الطابور", "Queue alert runs"],
  patient_portal_delivery_events: ["رسائل بوابة المرضى المسلّمة", "Portal delivery events"],
  leads: ["العملاء المحتملون", "Leads"],
  lead_activities: ["نشاط العملاء المحتملين", "Lead activity"],
  lead_assignments: ["توزيع العملاء المحتملين", "Lead assignments"],
  lead_followups: ["متابعات العملاء المحتملين", "Lead follow-ups"],
  lead_campaign_spend: ["إنفاق الحملات الإعلانية", "Ad campaign spend"],
  meta_ads_connections: ["ربط حساب الإعلانات", "Ad account connection"],
  meta_ads_sync_runs: ["تشغيلات مزامنة الإعلانات", "Ad sync runs"],
  saas_invoices: ["فواتير المنصة", "Platform invoices"],
  saas_payments: ["مدفوعات المنصة", "Platform payments"],
  report_schedules: ["التقارير المجدولة", "Scheduled reports"],
  saved_reports: ["التقارير المحفوظة", "Saved reports"],
  self_checkin_tokens: ["روابط تسجيل الوصول", "Check-in links"],
  ai_tool_audit_log: ["سجل أدوات المساعد الذكي", "AI tool audit trail"],
  authz_shadow_decisions: ["قرارات الصلاحيات التجريبية", "Authorization shadow decisions"],
  system_backups: ["سجلات النسخ الاحتياطي", "Backup records"],
};

export function tableLabel(table: string, isAr: boolean): string | null {
  const entry = LABELS[table];
  return entry ? entry[isAr ? 0 : 1] : null;
}

export const TABLE_LABEL_KEYS = Object.keys(LABELS);

/**
 * The engine's reason is English prose. These are the codes it raises with a specific
 * operator action attached; everything else falls back to the counted-rows sentence.
 */
const CODE_REASONS: Record<string, readonly [string, string]> = {
  PROVIDER_HOSTNAME_ATTACHED: [
    "دومين مخصص ما زال مرتبطًا بمزوّد الخدمة. احذفه من لوحة الدومينات أولًا ليُزال عند المزوّد أيضًا.",
    "A custom domain still has a provider hostname attached. Delete it from the Domains panel first so it is removed at the provider too.",
  ],
  COMMUNICATION_HISTORY: [
    "تذكيرات أُرسلت بالفعل إلى المرضى. هذا سجل تواصل وليس طابورًا قابلًا للمسح.",
    "Reminders were already sent to patients. That is communication history, not a queue.",
  ],
  TREASURY_BALANCE_OPEN: [
    "خزينة ما زال بها رصيد. أقفلها وانقل المال قبل الحذف.",
    "A till still holds a balance. Close it and move the money before deleting.",
  ],
  SCOPE_UNMEASURABLE: [
    "لم يتمكن الفحص من قياس نطاق هذه المساحة داخل الجدول، وما لم يُقَس لا يُحذف.",
    "The assessment could not measure this workspace's scope in the table. What was not counted is not deleted.",
  ],
  SCOPE_TOO_BROAD: [
    "الجدول متصل بالمساحة عبر مسارات كثيرة جدًا، لذلك رفض الفحص تسمية نطاقه. لا شيء يُحذف.",
    "The table reaches the workspace through too many paths for the assessment to name its scope. Nothing is deleted.",
  ],
};

export function blockerReason(code: string, table: string, rows: number | null, isAr: boolean): string {
  const specific = CODE_REASONS[code];
  if (specific) return specific[isAr ? 0 : 1];
  const label = tableLabel(table, isAr);
  const counted = rows === null ? (isAr ? "بيانات" : "data") : `${rows}`;
  if (label) {
    return isAr ? `${label} موجودة (${counted}). لا يمسحها الحذف النهائي.` : `${label} exist (${counted}). Permanent deletion never erases them.`;
  }
  return isAr
    ? `توجد بيانات تشغيلية في هذا الجدول (${counted}). لا يمسحها الحذف النهائي.`
    : `Operational data exists in this table (${counted}). Permanent deletion never erases it.`;
}

export function blockerActionLabel(action: string, isAr: boolean): string | null {
  if (action === "domains") return isAr ? "احذف الدومين من لوحة الدومينات" : "Remove the domain in the Domains panel";
  if (action === "archive") return isAr ? "الأرشفة هي الإجراء المناسب" : "Archiving is the right action";
  return null;
}
