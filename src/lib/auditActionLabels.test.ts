import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  auditActionTone,
  sortAuditActions,
} from "./auditActionLabels";

// Every distinct action in Production public.audit_logs, queried 2026-11-01.
// Pinned here so adding a writer without a label fails a test instead of
// quietly rendering a raw token (or hiding the row) on the audit screen.
const PRODUCTION_ACTIONS_2026_11_01 = [
  "update",
  "create",
  "insert",
  "role_granted",
  "role_revoked",
  "status_change",
  "admin_delete_user",
  "soft_delete",
  "custom_domain_status",
  "treasury_tx.reversal",
  "delete",
  "role_changed",
  "account_hard_deleted",
  "sensitive_field_change",
  "admin_export",
  "admin_export_complete",
  "permission_changed",
  "permission_granted",
  "provider_subdomain_created",
  "provider_subdomain_status",
  "account_deactivated",
  "appointment_created",
  "appointment_deleted",
  "custom_domain_created",
  "custom_domain_removed",
  "treasury_tx.manual",
  "appointment_updated",
  "custom_domain_disabled",
  "permission_revoked",
  "self_checkin_link_created",
  "user_role_assigned",
  "user_role_changed",
  "user_role_cleared",
];

// Tokens written by call sites on main that have not fired in Production yet.
const WRITER_ONLY_ACTIONS = [
  "appointment_transferred",
  "walk_in_created",
  "user_role_reaffirmed",
  "self_checkin_completed",
  "employee_linked",
  "employee_unlinked",
  "employee_replaced",
  "employee_link_reaffirmed",
  "role_applied",
  "role_permissions_matrix_saved",
  "branch.archive",
  "purchase_order_submitted",
  "purchase_order_cancelled",
  "purchase_order_deleted",
  "purchase_order_edited_submitted",
  "merge",
  "admin_override",
  "manual_adjustment",
  "daily_close.create",
  "invoice_consumable_stock_failed",
  "invoice_product_stock_failed",
];

describe("audit action labels", () => {
  it("labels every action that exists in Production today", () => {
    expect(PRODUCTION_ACTIONS_2026_11_01.filter(a => !AUDIT_ACTION_LABELS[a])).toEqual([]);
  });

  it("labels every writer-only action already present on main", () => {
    expect(WRITER_ONLY_ACTIONS.filter(a => !AUDIT_ACTION_LABELS[a])).toEqual([]);
  });

  it("has a distinct, non-empty Arabic and English label for every known action", () => {
    for (const [token, { ar, en }] of Object.entries(AUDIT_ACTION_LABELS)) {
      expect(ar.trim(), token).not.toBe("");
      expect(en.trim(), token).not.toBe("");
      expect(ar, token).not.toBe(en);
    }
  });

  it("renders the label for the UI language, including dotted tokens", () => {
    expect(auditActionLabel("admin_delete_user", "ar")).toBe("حذف حساب بواسطة الإدارة");
    expect(auditActionLabel("admin_delete_user", "en")).toBe("Account deleted by admin");
    expect(auditActionLabel("treasury_tx.reversal", "en")).toBe("Treasury transaction reversal");
    expect(auditActionLabel("daily_close.create", "ar")).toBe("إنشاء إغلاق يومي");
  });

  it("keeps an unknown action visible instead of hiding or guessing it", () => {
    expect(auditActionLabel("some_future.action_v2", "ar")).toBe("some future action v2");
    expect(auditActionLabel("some_future_action", "en")).toBe("some future action");
    expect(auditActionLabel(null, "en")).toBe("—");
  });

  it("marks destructive actions so they do not look routine", () => {
    expect(auditActionTone("delete")).toBe("destructive");
    expect(auditActionTone("soft_delete")).toBe("destructive");
    expect(auditActionTone("admin_delete_user")).toBe("destructive");
    expect(auditActionTone("treasury_tx.reversal")).toBe("destructive");
    expect(auditActionTone("update")).toBe("info");
    expect(auditActionTone("create")).toBe("success");
    expect(auditActionTone("self_checkin_completed")).toBeNull();
  });

  it("dedupes and orders actions by their visible label", () => {
    expect(sortAuditActions(["update", "admin_export", "create", "update", "delete"], "en"))
      .toEqual(["admin_export", "create", "delete", "update"]);

    const arabic = sortAuditActions(["update", "create", "update"], "ar");
    expect(arabic).toHaveLength(2);
    expect(new Set(arabic)).toEqual(new Set(["update", "create"]));
  });
});
