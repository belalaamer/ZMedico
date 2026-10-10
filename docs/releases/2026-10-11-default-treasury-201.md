# ZMED-201: guarded default treasury lookup

## Individually approved and applied

The human explicitly approved201only. The existing scalar treasury helper now checks caller identity, existing financial authority and branch access before selection, excludes disabled/deleted treasuries and restores only the intended authenticated EXECUTE permission. Trusted service behavior requires both the service JWT claim and the actual service SQL role. Editable metadata and the definer current_user do not confer trust.

- Reviewed source: supabase/migrations/20261009231039_guard_authenticated_default_treasury_lookup.sql.
- Source SHA256: 725428c4e7566afa9a53da5c9a15549fca95f9df5199f26707f49330e0d0095c.
- Hosted migration history: 20261010210307, guard_authenticated_default_treasury_lookup.
- Helper definition MD5: 7997e5b68169c179817b122ffa27fb38 → ef61ca409a3e40864952699b419ae326.
- Existing owner and SECURITY DEFINER mode retained; search_path intentionally hardened to empty.
- Authenticated/service EXECUTE granted, anon/PUBLIC denied; no financial-table grants or RLS change.
- Global public table ACL/RLS and policy fingerprints unchanged; previously deployed207 protection retained.
- No balances, financial rows, historical audit records, roles or accounts changed by this migration. No frontend or Edge Function release.

Source and hosted timestamps differ intentionally. Do not reapply a deployed migration to align CLI history and never automatically push all migrations to Production.

## Verification and remaining limits

Local original Admin payment/expense/expense reversal/financial-period native checks33passed. The combined post207→rebased196→rebased200 with201candidate passed29actual-accountant-JWT checks, including the original payment POST without treasury_id; this does not publish those other candidates. Full local application955tests/91files and both TypeScript projects passed.

Production verification confirms expected function metadata/history and four configured rollback negatives: no identity, spoofed service claim, nonexistent roleless identity and editable metadata spoof. Anonymous execution remains denied. These are not live staff authentication/payment E2E tests; no Production financial transaction was created.

Security advisors add exactly one generic authenticated-SECURITY-DEFINER-executable finding for public.default_treasury_for_branch(_branch_id uuid), because the intended guarded API is now executable. Other semantic findings unchanged after excluding observed_at timestamps. This is not a clean-security certification; retain the verified identity/permission/branch guards and review exposed definers separately. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Global session revocation185, accountant wallet funding200, financial cancellation package and automated ephemeral GitHub authenticated provisioning remain separate work. This commit records201ONLY.
