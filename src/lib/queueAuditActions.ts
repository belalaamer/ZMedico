// Current server-trigger vocabulary plus the legacy read-activity event for
// historical rows. Both audit screens must use this same contract.
export const QUEUE_AUDIT_ACTIONS = [
  "status_change", "doctor_reassigned", "room_assigned", "walk_in_created",
  "consultation_opened", "appointment_created", "appointment_updated",
  "appointment_deleted", "priority_changed",
  "appointment_rescheduled", "appointment_patient_changed", "appointment_transferred",
] as const;

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
