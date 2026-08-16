-- Security hardening: internal SECURITY DEFINER helpers and trigger-only
-- functions must not be callable through the PostgREST RPC surface.
--
-- These functions are invoked by database triggers or by other trusted
-- SECURITY DEFINER routines. They do not represent user-facing RPCs. Removing
-- EXECUTE from PUBLIC/anon/authenticated closes the direct-call capability
-- reported by Supabase Security Advisor while preserving trigger execution and
-- service_role access.
--
-- Intentionally not changed here: user-facing RPCs such as has_role,
-- has_permission, admin-export, add_treasury_tx, apply_inventory_tx, and other
-- application entrypoints that perform their own authorization checks.

REVOKE EXECUTE ON FUNCTION public._audit_write(text, uuid, text, jsonb, jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._tg_client_errors_append_only()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._tg_expense_period_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._tg_treasury_tx_append_only()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._treasury_assert_open_period(uuid, uuid, date)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.tg_appointment_create_notifications()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_appointment_create_reminders()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_invoices()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_medical_records()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_patients()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_payments()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_physio_cases()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_physio_child()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_prescriptions()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_role_permissions()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_staff_sensitive()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_user_roles()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_wallet_tx()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_block_delete_billed_procedure()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_branch_after_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_branch_before_insert_code()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_branches_cleanup_orphans()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_cascade_patient_soft_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_coupon_redemption_after_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_enforce_branch_referential_integrity()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_guard_system_owner_invite()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_expense_after_soft_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_inventory_after_update()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invoice_after_cancel_reversal()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invoice_after_referral_reward()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invoice_after_status_paid()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invoice_amount_locked_when_paid()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invoice_before_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invoice_item_after_iu()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invoice_item_aiud()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invoice_number_immutable()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invoice_renumber_after_change()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_leave_request_self_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_patient_assign_code()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_patient_code_immutable()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_payment_after_insert_wallet()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_payment_after_soft_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_payment_after_soft_delete_wallet()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_payment_before_insert_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_payment_immutable_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_payroll_attach_commissions()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_perf_review_self_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_performance_review_self_update_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_physio_cases_validate_appointment()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_physio_sessions_validate_appointment()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_po_after_soft_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_po_before_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_po_item_aiud()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_product_before_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_record_procedure_commission()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_reject_retired_roles()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_saas_invoice_before_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_staff_before_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_staff_self_update_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_stock_alert_notify()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_sync_staff_branch()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_treatment_session_after_change()
  FROM PUBLIC, anon, authenticated;
