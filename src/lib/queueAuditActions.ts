// Current server-trigger vocabulary plus the legacy read-activity event for
// historical rows. Both audit screens must use this same contract.
export const QUEUE_AUDIT_ACTIONS = [
  "status_change", "doctor_reassigned", "room_assigned", "walk_in_created",
  "consultation_opened", "appointment_created", "appointment_updated",
  "appointment_deleted", "priority_changed",
  "appointment_rescheduled", "appointment_patient_changed", "appointment_transferred",
] as const;

export type QueueAuditAction = typeof QUEUE_AUDIT_ACTIONS[number];

// C11: both audit screens rendered `action.replace(/_/g, " ")`, so an Arabic desk read
// "status change" and "walk in created" in English letters. The Record is keyed by the
// action union, so TypeScript fails the build if a trigger action is added to the list
// above without a label here — the fallback below can only ever be reached by a row whose
// action predates or postdates this client, not by one we forgot.
export const QUEUE_AUDIT_ACTION_LABELS: Record<QueueAuditAction, { ar: string; en: string }> = {
  status_change: { ar: "تغيير حالة", en: "Status changed" },
  doctor_reassigned: { ar: "نقل المريض لطبيب آخر", en: "Doctor reassigned" },
  room_assigned: { ar: "تخصيص غرفة", en: "Room assigned" },
  walk_in_created: { ar: "إنشاء حضور فوري", en: "Walk-in created" },
  consultation_opened: { ar: "بدء الكشف", en: "Consultation opened" },
  appointment_created: { ar: "إنشاء موعد", en: "Appointment created" },
  appointment_updated: { ar: "تعديل موعد", en: "Appointment updated" },
  appointment_deleted: { ar: "حذف موعد", en: "Appointment deleted" },
  priority_changed: { ar: "تغيير الأولوية", en: "Priority changed" },
  appointment_rescheduled: { ar: "إعادة جدولة موعد", en: "Appointment rescheduled" },
  appointment_patient_changed: { ar: "تغيير المريض المرتبط", en: "Patient changed" },
  appointment_transferred: { ar: "نقل الموعد لفرع آخر", en: "Appointment transferred" },
};

export function queueActionLabel(action: string, lang: "ar" | "en") {
  const labels = QUEUE_AUDIT_ACTION_LABELS as Record<string, { ar: string; en: string }>;
  return labels[action]?.[lang] ?? action.replace(/_/g, " ");
}

export const QUEUE_AUDIT_SAFE_KEYS = [
  "status", "doctor_id", "room", "priority", "is_walk_in", "checked_in_at",
  "started_at", "deleted_at",
  "patient_id", "branch_id", "scheduled_at", "duration_minutes", "service_id",
  "resource_id", "booking_request_status", "booking_request_expires_at",
  "booking_rejected_at", "booking_rejected_by", "booking_confirmed_at",
  "booking_confirmed_by", "self_checked_in_at", "check_in_method",
  "booking_expiry_alert_sent_at", "notes_changed", "procedure_changed",
  "booking_metadata_changed", "booking_reference_changed", "booking_reason_changed",
  "id", "created_at", "booking_source", "public_booking_created_at",
] as const;
