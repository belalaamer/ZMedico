/**
 * Bilingual labels for audit_logs.action.
 *
 * The vocabulary is evidence-based, not guessed: every token below is either
 * present in Production's audit_logs (queried 2026-11-01) or written by a
 * call site on main (_audit_write literals, direct audit_logs inserts, and
 * the Edge functions admin-delete-user / admin-export / manage-custom-domain).
 * Tokens are grouped the way the writers use them so a reviewer can trace any
 * label back to its source.
 *
 * Unknown tokens keep their meaning visible: they fall back to the raw value
 * with separators spaced out ("walk_in_created" -> "walk in created") instead
 * of being hidden or guessed at.
 */

export type AuditActionDefinition = { ar: string; en: string };

export type AuditActionTone = "success" | "info" | "destructive";

export const AUDIT_ACTION_LABELS: Record<string, AuditActionDefinition> = {
  // Generic row actions (_audit_write call sites)
  create: { ar: "إنشاء", en: "Create" },
  insert: { ar: "إضافة", en: "Insert" },
  update: { ar: "تحديث", en: "Update" },
  delete: { ar: "حذف", en: "Delete" },
  status_change: { ar: "تغيير الحالة", en: "Status change" },
  soft_delete: { ar: "حذف مؤقت", en: "Soft delete" },

  // Access, roles, permissions and account lifecycle
  role_granted: { ar: "منح دور", en: "Role granted" },
  role_revoked: { ar: "سحب دور", en: "Role revoked" },
  role_changed: { ar: "تغيير الدور", en: "Role changed" },
  role_applied: { ar: "تطبيق الدور", en: "Role applied" },
  user_role_assigned: { ar: "إسناد دور", en: "Role assigned" },
  user_role_changed: { ar: "تغيير دور المستخدم", en: "User role changed" },
  user_role_cleared: { ar: "إزالة دور المستخدم", en: "User role cleared" },
  user_role_reaffirmed: { ar: "تثبيت دور المستخدم", en: "User role reaffirmed" },
  permission_granted: { ar: "منح صلاحية", en: "Permission granted" },
  permission_revoked: { ar: "سحب صلاحية", en: "Permission revoked" },
  permission_changed: { ar: "تغيير صلاحية", en: "Permission changed" },
  role_permissions_matrix_saved: { ar: "حفظ مصفوفة صلاحيات الأدوار", en: "Role permissions matrix saved" },
  admin_delete_user: { ar: "حذف حساب بواسطة الإدارة", en: "Account deleted by admin" },
  account_hard_deleted: { ar: "حذف نهائي للحساب", en: "Account permanently deleted" },
  account_deactivated: { ar: "تعطيل حساب", en: "Account deactivated" },
  admin_export: { ar: "بدء تصدير إداري", en: "Admin export started" },
  admin_export_complete: { ar: "اكتمال تصدير إداري", en: "Admin export completed" },
  sensitive_field_change: { ar: "تغيير بيانات حساسة", en: "Sensitive field change" },

  // Appointments and clinical records
  appointment_created: { ar: "إنشاء موعد", en: "Appointment created" },
  appointment_updated: { ar: "تحديث موعد", en: "Appointment updated" },
  appointment_deleted: { ar: "حذف موعد", en: "Appointment deleted" },
  appointment_transferred: { ar: "نقل موعد", en: "Appointment transferred" },
  self_checkin_link_created: { ar: "إنشاء رابط تسجيل وصول", en: "Self check-in link created" },
  self_checkin_completed: { ar: "تسجيل وصول ذاتي", en: "Self check-in completed" },
  walk_in_created: { ar: "إنشاء زيارة بدون موعد", en: "Walk-in visit created" },
  admin_override: { ar: "تجاوز إداري", en: "Admin override" },
  merge: { ar: "دمج سجلات", en: "Records merged" },

  // Treasury and stock integrity
  "treasury_tx.manual": { ar: "حركة خزينة يدوية", en: "Manual treasury transaction" },
  "treasury_tx.reversal": { ar: "عكس حركة خزينة", en: "Treasury transaction reversal" },
  manual_adjustment: { ar: "تسوية يدوية", en: "Manual adjustment" },
  invoice_consumable_stock_failed: { ar: "تعذّر خصم مخزون المستهلكات", en: "Consumable stock deduction failed" },
  invoice_product_stock_failed: { ar: "تعذّر خصم مخزون المنتجات", en: "Product stock deduction failed" },

  // Custom / provider domains
  custom_domain_created: { ar: "إنشاء نطاق مخصص", en: "Custom domain created" },
  custom_domain_removed: { ar: "إزالة نطاق مخصص", en: "Custom domain removed" },
  custom_domain_disabled: { ar: "تعطيل نطاق مخصص", en: "Custom domain disabled" },
  custom_domain_status: { ar: "تغيير حالة نطاق مخصص", en: "Custom domain status change" },
  provider_subdomain_created: { ar: "إنشاء نطاق فرعي للمزوّد", en: "Provider subdomain created" },
  provider_subdomain_status: { ar: "تغيير حالة نطاق فرعي للمزوّد", en: "Provider subdomain status change" },

  // Purchasing, staffing and branch structure
  purchase_order_submitted: { ar: "إرسال أمر شراء", en: "Purchase order submitted" },
  purchase_order_cancelled: { ar: "إلغاء أمر شراء", en: "Purchase order cancelled" },
  purchase_order_deleted: { ar: "حذف أمر شراء", en: "Purchase order deleted" },
  purchase_order_edited_submitted: { ar: "تعديل وإرسال أمر شراء", en: "Purchase order edited and submitted" },
  employee_linked: { ar: "ربط موظف بحساب", en: "Employee linked to account" },
  employee_unlinked: { ar: "فصل موظف عن الحساب", en: "Employee unlinked from account" },
  employee_replaced: { ar: "استبدال ربط الموظف", en: "Employee link replaced" },
  employee_link_reaffirmed: { ar: "تثبيت ربط الموظف", en: "Employee link reaffirmed" },
  "branch.archive": { ar: "أرشفة فرع", en: "Branch archived" },
  "daily_close.create": { ar: "إنشاء إغلاق يومي", en: "Daily close created" },
};

const ACTION_TONES: Record<string, AuditActionTone> = {
  create: "success",
  insert: "success",
  update: "info",
  delete: "destructive",
  soft_delete: "destructive",
  admin_delete_user: "destructive",
  account_hard_deleted: "destructive",
  role_revoked: "destructive",
  permission_revoked: "destructive",
  user_role_cleared: "destructive",
  "treasury_tx.reversal": "destructive",
};

export function auditActionLabel(action: string | null | undefined, lang: "ar" | "en" | string): string {
  if (!action) return "—";
  const known = AUDIT_ACTION_LABELS[action];
  if (known) return lang === "ar" ? known.ar : known.en;
  return action.replace(/[_.]+/g, " ").trim();
}

export function auditActionTone(action: string | null | undefined): AuditActionTone | null {
  if (!action) return null;
  return ACTION_TONES[action] ?? null;
}

/** Unique, localized ordering so the filter list matches the language it is shown in. */
export function sortAuditActions(actions: Iterable<string>, lang: "ar" | "en" | string): string[] {
  const locale = lang === "ar" ? "ar" : "en";
  return Array.from(new Set(actions)).sort((a, b) => {
    const byLabel = auditActionLabel(a, lang).localeCompare(auditActionLabel(b, lang), locale);
    return byLabel !== 0 ? byLabel : a.localeCompare(b, locale);
  });
}
