# T1 — Migration source-of-truth inventory

Read-only analysis of Production `rqcmnfzfytyyicelvifk` compared with this
repository. No Production change was made; no `migration repair` was used.

## Method

- Source of truth for what actually ran: `supabase_migrations.schema_migrations`
  (486 rows, all carrying the original `statements`).
- Repository side: `supabase/migrations/*.sql` (437 files).
- Matching was done by **normalised SQL content** (comments/whitespace removed),
  not by version number or filename, because the two histories disagree on
  version numbers.

## What the comparison found

| Measure | Count |
|---|---|
| Production migration rows | 486 |
| Repository migration files | 437 |
| Production rows whose SQL exists in the repo (under *some* version) | 397 |
| **Production rows whose SQL is absent from the repo** | **89** |
| Repository files whose SQL is absent from Production | 39 |
| Production versions with no repo file of the same version | 409 |

**The earlier figure of 74 was name-based and under-counted.** By content the
real gap is 89. Separately, 397 migrations exist in both but under *different
version numbers*, so version keys cannot be used to align the histories.

## Classification

| Class | Count | Meaning | Confidence |
|---|---|---|---|
| A. Aligned | 77 | same version and same content | high |
| B. Re-versioned | 397 | same content, different version | high for content; order needs a replay run |
| C. Missing | 89 | content absent from the repo; recovered verbatim | high for SQL text; medium for position |
| D. Repo-only | 39 | in the repo, not in Production (unmerged PRs + drift) | needs per-file review |

## Class C — 89 recovered migrations

Each file under `supabase/migrations.recovered/` is the verbatim `statements`
text from Production plus a provenance header. They are **not** active: they are
kept out of `supabase/migrations/` so the current build is not silently changed,
and so their integration can be reviewed deliberately.

| # | Version | Name |
|---|---|---|
| 1 | `20260803100146` | `fix_real_data_branch_and_role_scoping` |
| 2 | `20260803100221` | `fix_insert_update_branch_scoping_real_data` |
| 3 | `20260803100303` | `systematic_branch_scoping_fix_real_data` |
| 4 | `20260803100327` | `lockdown_security_definer_functions_real_project` |
| 5 | `20260803195911` | `multi_branch_staff_access` |
| 6 | `20260803211100` | `system_owner_and_per_branch_invoice_numbering` |
| 7 | `20260803213241` | `financial_regression_test_suite` |
| 8 | `20260804112214` | `repair_data_damaged_by_permission_tests_v4` |
| 9 | `20260805103212` | `scope_legacy_role_permissions_read` |
| 10 | `20260806073546` | `fix_first_line_item_on_discounted_invoice` |
| 11 | `20260806074052` | `align_bundles_with_clinical_rls_and_clear_dead_staff_refs` |
| 12 | `20260806074331` | `close_two_empty_screens_reminders_and_accountant_calendar` |
| 13 | `20260806110358` | `tighten_physio_write_policies_to_clinical_roles` |
| 14 | `20260817093835` | `add_patient_name_language` |
| 15 | `20260818065943` | `bilingual_physio_therapists` |
| 16 | `20260818104209` | `secure_notification_settings_upsert` |
| 17 | `20260822200849` | `platform_onboarding_rpc` |
| 18 | `20260823084238` | `provider_subdomain_rate_limit` |
| 19 | `20260823145432` | `secure_sensitive_views_and_public_rpc_grants` |
| 20 | `20260824094800` | `repair_queue_alert_schedule` |
| 21 | `20260824102047` | `restrict_legacy_public_booking_authenticated` |
| 22 | `20260824102242` | `remove_legacy_booking_authenticated_grants` |
| 23 | `20260825205309` | `platform_save_tenant_branding` |
| 24 | `20260825215352` | `restore_authenticated_scope_helper_exec` |
| 25 | `20260825221231` | `whatsapp_clinic_events_and_templates` |
| 26 | `20260826082639` | `close_cross_tenant_identity_and_audit_leak` |
| 27 | `20260826095342` | `booking_resource_capacity_guard` |
| 28 | `20260826163744` | `patient_portal_credential_templates` |
| 29 | `20260826170017` | `patient_portal_first_login_guard` |
| 30 | `20260831105815` | `close_orphan_clinical_row_branch_gate` |
| 31 | `20260831112546` | `lead_ad_attribution_and_campaign_roi` |
| 32 | `20260831113448` | `lead_attribution_top_level_utm_fallback` |
| 33 | `20260831205010` | `meta_lead_ads_ingestion` |
| 34 | `20260902213450` | `settings_assign_user_role_require_branch` |
| 35 | `20260902213533` | `handle_new_user_require_branch` |
| 36 | `20260902213745` | `settings_assign_user_role_fix_branch_lookup` |
| 37 | `20260902223851` | `public_booking_require_confirmation_default_and_hold` |
| 38 | `20260903174421` | `patient_portal_accounts_select_policy` |
| 39 | `20260903200110` | `patient_portal_booking_and_shared_core` |
| 40 | `20260903211803` | `add_booking_expiry_staff_alert` |
| 41 | `20260903211843` | `fix_tg_public_booking_to_lead_utm_null` |
| 42 | `20260904162501` | `create_normalize_phone_digits_helper` |
| 43 | `20260904162514` | `fix_public_create_booking_phone_match` |
| 44 | `20260904164936` | `fix_user_has_tenant_access_remove_global_admin_bypass` |
| 45 | `20260904164957` | `add_tenant_scoping_to_shared_medical_reference_tables` |
| 46 | `20260905123714` | `ai_messaging_platform_phase1` |
| 47 | `20260905161659` | `ai_booking_tools_phase2` |
| 48 | `20260905161736` | `ai_tool_audit_log` |
| 49 | `20260905163859` | `ai_provider_config_vault` |
| 50 | `20260922051415` | `tenant_scope_inventory_catalog` |
| 51 | `20260922081824` | `restrict_platform_tenant_management_to_system_owner` |
| 52 | `20260922153206` | `optimize_inventory_catalog_policies_and_actor_fks` |
| 53 | `20260923144215` | `protect_purchase_order_workflow` |
| 54 | `20260923145536` | `protect_inventory_ledger` |
| 55 | `20260923150131` | `harden_inventory_catalog` |
| 56 | `20260923150852` | `fix_invoice_inventory_accounting` |
| 57 | `20260924191312` | `rate_limit_public_booking` |
| 58 | `20260924192609` | `harden_phi_access_audit` |
| 59 | `20260924193104` | `phi_audit_collection_compat` |
| 60 | `20260924193459` | `enable_secure_patient_docs_storage` |
| 61 | `20260925105627` | `harden_product_image_storage` |
| 62 | `20260925110046` | `harden_public_doctor_directory` |
| 63 | `20260925110342` | `revoke_view_write_grants` |
| 64 | `20260925110635` | `harden_physio_realtime_rls` |
| 65 | `20260925111017` | `align_clinical_child_rls` |
| 66 | `20260925111232` | `align_finance_hr_rls` |
| 67 | `20260925111527` | `harden_integration_config_writes` |
| 68 | `20260925111804` | `harden_clinical_catalog_writes` |
| 69 | `20260925112224` | `reduce_booking_cron_overhead` |
| 70 | `20260925123608` | `revoke_readonly_view_dml` |
| 71 | `20260925123841` | `retire_legacy_public_booking_rpcs` |
| 72 | `20260925124406` | `rate_limit_direct_public_booking_rpc` |
| 73 | `20260925124740` | `product_image_legacy_owner_compat` |
| 74 | `20260925130104` | `retire_completed_shadow_telemetry` |
| 75 | `20260925130245` | `optimize_hot_auth_rls_initplans` |
| 76 | `20260925222555` | `fix_invoice_event_status_select` |
| 77 | `20261008224944` | `guard_expense_self_audit_scope` |
| 78 | `20261009010549` | `require_active_clinical_role_for_record_edit` |
| 79 | `20261009123707` | `guard_authenticated_financial_period_assertion` |
| 80 | `20261009135823` | `guard_wallet_finite_amounts` |
| 81 | `20261009135852` | `fix_wallet_manual_adjustment_audit` |
| 82 | `20261014095117` | `prevent_duplicate_open_queue_alerts` |
| 83 | `20261014095325` | `atomic_system_language_defaults` |
| 84 | `20261015155156` | `guard_serialized_invoice_payments_release` |
| 85 | `20261021203931` | `20261021190000_gate_legacy_appointment_reminder_enqueue` |
| 86 | `20261101120000` | `20261101120000_p2db_self_checkin_details_reason` |
| 87 | `20261104130000` | `20261104130000_notification_clinic_time_12h` |
| 88 | `20261104150000` | `20261104150000_financial_regression_test8_branch_fixture` |
| 89 | `20261105112453` | `20261105131000_treasury_close_rigour_optional` |

## Clean-build status (the T1 acceptance test)

`tools/t1/clean-build.sh` builds a scratch database from the repository alone.

1. A **bare** Postgres fails immediately: the first migration needs the `auth`
   schema and `auth.uid()`. Supabase provisions these outside the repository, so
   `tools/t1/platform-base.sql` declares that contract explicitly.
2. With the platform base loaded: **35 of 436** migrations apply, then the build
   stops at `20260502234939` because it runs
   `setval('patient_code_seq', 0)` and a fresh sequence starts at 1. This is a
   **replay-safety bug in a historical migration**, not a platform gap.
3. With the 89 recovered files added in version order: same stop at 35/523.

**T1 is not complete.** It is complete only when the full set applies on an empty
database and the resulting schema is compared with Production.

## What remains, in order

1. **Replay-safety pass** over historical migrations (data assumptions such as
   `setval(seq,0)`, seed `INSERT`s, and `CREATE` without `IF NOT EXISTS`). Each
   fix is annotated as a replay fix, not a rewrite of intent.
2. Re-run the build to the next failure and repeat until the full set applies.
3. **Decide the version reconciliation**: keep repo versions canonical and treat
   Production versions as provenance, or re-key the repo to Production versions.
   The clean build and schema diff are what decide this, not aesthetics.
4. **Schema comparison** against Production across tables, columns, types,
   indexes, constraints, functions, triggers, views, policies and grants;
   document every intentional difference.
5. **Include the treatment-plan invoice trigger**, which currently exists only in
   Production. #281 replaces its function but assumes the trigger is present.
   T1 must create it from repository files.
6. Re-apply #280, #281 and #282 on top of the restored history in timestamp
   order and prove they still compose.

## Boundaries

- No `migration repair`; no edit to `schema_migrations`; no replay on Production.
- Recovered files are verbatim; they are not authoring new intent.
