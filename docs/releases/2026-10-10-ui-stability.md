# Frontend stability release

This package fixes invalid or stale language preferences, stale branch bootstrap responses, insurance contract navigation and delayed reads, GPS boundary/submission handling, and unconfirmed catalog status changes. Authorization-shadow failures are handled with bounded diagnostics.

Build corrections update schema declarations and generated Workers types, normalize PromiseLike handling, repair payload types, restore calendar resource reset and notification import, and use the existing patient-code allocation trigger. The trigger definition and enabled state were checked against Production before testing zero-code allocation locally under rollback. The package adds no database migration or Edge Function and no new backend function call.

The build command now checks both application and tooling TypeScript projects. Primary and fallback deployments require authenticated smoke credentials; fallback also runs unit tests. Protected-route tests reject wrong-route redirects, permission placeholders and unresolved permission checks. Public smoke blocks connected Supabase mutations and checks protected URL refreshes.

Validation recorded during preparation:

-86focused component/helper cases across8files pass.
-535application cases across48files pass; application/tooling TypeScript pass.
-Actual isolated local release browser:13workflow checks plus2cleanup checks pass, covering login, five protected pages, invalid-language fallback, exact-profile language persistence and refresh, and selected mobile overflow. Original preference and all financial ledgers/balances/payments/closes restored.
-Existing Worker regression7cases pass after reproducing and fixing the HTML Request cross-realm signal failure.
-The original backend remains responsible for all permissions and data isolation. These checks do not certify every screen's CRUD or the entire system.

Final production bundle, public responsive smoke and hosted CI/deployment results are recorded in the release receipt when complete. Remaining financial, queue, clinical and session changes stay in their separate reviewed packages.
