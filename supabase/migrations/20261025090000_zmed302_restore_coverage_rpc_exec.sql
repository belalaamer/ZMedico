-- ZMED-302: restore EXECUTE for fn_resolve_coverage to `authenticated`.
--
-- 20260922082822_restrict_insurance_coverage_helper_rpc.sql revoked it while
-- leaving the client call site (src/lib/insuranceContracts.ts) in place. The
-- resolver is SECURITY DEFINER and read-only, and the roles that call it
-- already hold table-level SELECT on insurance_contracts and
-- insurance_contract_rules with broader read policies, so the revoke bought no
-- isolation. What it did change is billing: every invoice raised for a company
-- with an active contract resolved to a zero claim.
--
-- Verified on Production before writing this migration:
--   * calling as `authenticated` fails with 42501 permission denied;
--   * granting in the same transaction makes the call succeed (1 row) and the
--     ACL show authenticated=X; both were rolled back and re-checked unchanged.
-- Anonymous and unauthenticated callers stay blocked.
REVOKE EXECUTE ON FUNCTION public.fn_resolve_coverage(uuid, public.invoice_item_type, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_coverage(uuid, public.invoice_item_type, uuid, numeric) TO authenticated;
