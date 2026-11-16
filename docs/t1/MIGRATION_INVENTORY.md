# T1 — Migration source-of-truth inventory (review 2)

Read-only analysis of Production `rqcmnfzfytyyicelvifk` compared with this
repository. No Production change was made: no migration was applied, no
`migration repair` was used, and `schema_migrations` was only read.

**Status:** review only. PR #283 is Draft until this inventory, the mapping and
the two clean-build tests are reviewable. CI or a Workers build is not evidence
that T1 is complete.

The first pass produced three numbers that do not survive a closer look:
`437` repository files, `397` content matches and `89` missing migrations.
`MANIFEST.json` and `clean-build.sh` already counted 436 files; the 437 was only
in the prose and the commit message. This review replaces the three numbers with
an exclusive classification that sums to the 486 Production rows, and separates
the repository history from the Production history.

## 0. TL;DR

| Measure | First pass | This review |
|---|---|---|
| Repository migration files | 437 | **436** |
| Production migration rows | 486 | 486 |
| Production rows with an exact token-equivalent repo file | 397 | **413** (72 same version + 341 re-versioned) |
| Production rows with no exact token-equivalent repo file | 89 | **70** (2 same-version conflicts + 68 no exact match) |
| Production rows that are registration notes, not SQL | 0 | **3** |
| Repo files with no exact token-equivalent Production row | 39 | **22** (17 repo-only + 3 note sources + 2 conflict editions) |

The first pass called all 89 “missing”. In fact:

- 16 of the 89 are formatting-only copies of a repo file (whitespace,
  dollar-quote tags, transaction wrappers);
- 3 are prose registration notes that cite an existing repo file, with matching
  md5 and byte counts;
- 2 are genuine same-version/name conflicts where the SQL differs;
- 68 have no exact token equivalent in the repo.

## 1. Method

- **Production source:** `supabase_migrations.schema_migrations`, read through
  the Supabase management API with a `SELECT`. Result: 486 rows, 486 distinct
  versions, 360 distinct names; every row has `statements`.
- **Repository source:** `supabase/migrations/*.sql` (436 files, 436 distinct
  versions, no duplicate version inside the directory).
- **Recovered source:** `supabase/migrations.recovered/*.sql` (89 files,
  one per Production row that the first pass classified as missing).

Matching is by **SQL token stream**, not by filename, version or normalised
text:

1. comments are removed;
2. the text is split into statements at **top-level** semicolons only, and a
   `STMT` boundary marker is inserted between statements. The terminating `;`
   itself is not a token, but the boundary it creates is;
3. dollar-quote tag names are ignored (`$fn$` and `$$` are the same delimiter);
4. a top-level `BEGIN; … COMMIT/ROLLBACK;` wrapper is ignored, but only when it
   is a complete pair around the whole text;
5. words are folded to lower case (unquoted identifiers are case-insensitive in
   PostgreSQL), but string literals and quoted identifiers keep their exact
   value;
6. dollar-quoted bodies are tokenised recursively. Whitespace and comments
   inside the body are ignored, but the semicolons that separate PL/pgSQL
   statements are **kept as tokens**;
7. the resulting statement token streams are hashed in order.

This fixes the first pass's main false negative: `(SELECT` and `( SELECT` were
treated as different migrations. It is a **provenance** match, not a proof of
semantic equivalence. Two token-equal files can still produce different objects
if their string literals differ, or if they run with a different `search_path`,
role or existing schema. The schema build and schema diff are what decide
behaviour.

### 1.1 Why dropping the top-level `;` does not lose statement boundaries

A semicolon at the top level is a terminator, not part of the statement's
meaning. `SELECT 1`, `SELECT 1;` and `SELECT 1;;;` are the same single
statement. What matters is the **sequence of statements**, not how many
terminators follow each one.

The matcher does not delete every semicolon and hope for the best. It first
splits the text into statements, using the same lexical rules PostgreSQL uses:

- a `;` inside `'…'`, `E'…'`, `U&'…'` or `"…"` is part of the literal or quoted
  identifier, not a boundary;
- a `;` inside a `--` line comment or a nested `/* … */` block comment is not a
  boundary;
- a `;` inside a `$$ … $$` or `$tag$ … $tag$` body belongs to the body, not to
  the outer statement.

Each top-level statement is then tokenised separately and joined with a `STMT`
marker. Therefore:

| Text | Result |
|---|---|
| `SELECT 1; SELECT 2;` | two statements, hash includes `STMT` between them |
| `SELECT 1 SELECT 2;` | one malformed statement, different hash |
| `SELECT 2; SELECT 1;` | two statements in a different order, different hash |
| `SELECT 'a;b'; SELECT 2;` | two statements; the first literal contains `;` |
| `CREATE FUNCTION … AS $$ BEGIN x := 1; y := 2; END; $$ …;` | one outer statement; the two inner semicolons remain tokens |
| `BEGIN; CREATE TABLE t(); COMMIT;` | same schema as `CREATE TABLE t();`; wrapper removed |
| `BEGIN; CREATE TABLE t();` | incomplete wrapper, preserved, so it does not match |

The tests in `tools/t1/tests/test_migration_match.py` prove these cases,
including multiple statements, outer `BEGIN`/`COMMIT`, PL/pgSQL dollar bodies,
string literals, quoted identifiers and comments. They also prove that changing
a statement boundary, statement order or a string literal changes the hash.
Run them with:

```bash
python3 -m unittest discover -s tools/t1/tests -v
```

At the reviewed commit this is 54 tests (25 matcher, 6 ambiguity, 23 history
preflight). A green test run proves the matcher is boundary-safe; it does not
prove the SQL is semantically identical.

Reproduce with:

```bash
python3 tools/t1/migration_match.py \
  --production /path/to/prod_full.json \
  --repo . \
  --out docs/t1
```

`prod_full.json` is the read-only query result
(`select version, name, statements from supabase_migrations.schema_migrations
order by version`). It is deliberately not committed.

## 2. Corrected inventory

### 2.1 Production taxonomy (exclusive; sums to 486)

| Class | Count | Meaning |
|---|---|---|
| **A. Exact** | 72 | Same version and same token stream. |
| **A2. Registration note** | 3 | Same version; the Production row is prose that registers an out-of-band apply and cites the repo file. md5 and byte count match the cited file. |
| **B. Re-versioned** | 341 | Same token stream under a different version. |
| **C. Same-version conflict** | 2 | Same version and name, but the Production SQL and the repo SQL differ. |
| **D. No exact match** | 68 | No same-version file and no token-equivalent repo file. |
| **Total** | **486** | |

Of the 486, 483 carry SQL and 3 are registration notes. Among the 483 SQL rows,
**413** have an exact token equivalent in the repo and **70** do not
(`C=2`, `D=68`).

### 2.2 Repository-side taxonomy (exclusive; sums to 436)

| Class | Count | Meaning |
|---|---|---|
| **A. Exact** | 72 | Same version and token stream as a Production row. |
| **B. Re-versioned** | 342 | Token-identical to a Production row under another version. 342 repo files map to 341 Production rows because one Production row has two repo duplicates. |
| **A2. Note source** | 3 | The repo file cited by a Production registration note. |
| **C. Conflict edition** | 2 | The repo edition of a same-version conflict. |
| **Repo-only** | 17 | No token-equivalent Production row. |
| **Total** | **436** | |

The 17 repo-only files are not all “new”: 7 have a same-name Production row
with different SQL, and several of the other 10 are near-duplicates under a
different name. See §5.

### 2.3 Why 77 / 397 / 89 did not add up

The first pass used overlapping labels:

| First-pass label | Count | What it actually contained | Corrected split |
|---|---|---|---|
| A. Aligned | 77 | 72 same version + same content; **5** same version but different content | 72 A + 2 C + 3 A2 |
| B. Re-versioned | 397 | **72** exact matches + 325 different-version matches | 341 B (325 + 16 formatting-only copies) |
| C. Missing | 89 | 2 real conflicts + 3 notes + 16 formatting duplicates + 68 absent | 2 C + 3 A2 + 16 B + 68 D |
| D. Repo-only | 39 | old text normalisation counted formatting differences as absent | 17 repo-only (+3 A2 sources +2 C editions) |

So the answer to “does 397 include the 77?” is **yes under the first-pass
labels**, which is exactly why they could not be added. The exclusive totals are
`72 + 3 + 341 + 2 + 68 = 486` on the Production side and
`72 + 342 + 3 + 2 + 17 = 436` on the repository side.

## 3. The five cross-history collisions

There are exactly five version-number collisions between
`supabase/migrations/` and `supabase/migrations.recovered/`:

| # | Version | Active repo file | Recovered file | Kind |
|---|---|---|---|---|
| 1 | `20260922051415` | `…_tenant_scope_inventory_catalog.sql` | same filename | same filename, different SQL |
| 2 | `20260922081824` | `…_restrict_platform_tenant_management_to_system_owner.sql` | same filename | same filename, different SQL |
| 3 | `20261101120000` | `…_p2db_self_checkin_details_reason.sql` | `…_20261101120000_p2db_self_checkin_details_reason.sql` | same version, note vs SQL |
| 4 | `20261104130000` | `…_notification_clinic_time_12h.sql` | `…_20261104130000_notification_clinic_time_12h.sql` | same version, note vs SQL |
| 5 | `20261104150000` | `…_financial_regression_test8_branch_fixture.sql` | `…_20261104150000_financial_regression_test8_branch_fixture.sql` | same version, note vs SQL |

`cp migrations/*.sql migrations.recovered/*.sql build/` overwrites #1 and #2
silently. It does not overwrite #3–#5 because the recovered filenames have the
version twice, but it then applies two files with the same version in
lexicographic order, which is not a valid history.

### 3.1 `20260922051415_tenant_scope_inventory_catalog.sql`

- Repo: 10,306 bytes. Production: 10,353 bytes. Token similarity: **0.989**.
- The diff is formatting plus one equivalent control-flow rewrite:
  `ELSIF TG_TABLE_NAME = 'product_categories' AND NEW.parent_id IS NOT NULL THEN`
  versus `ELSIF TG_TABLE_NAME = 'product_categories' THEN IF NEW.parent_id IS NOT NULL THEN`.
  Both do nothing when `parent_id` is null; the rest is whitespace.
- **Verdict:** one logical migration with two editions, not two migrations.
  Still a hard collision: replacing one with the other changes the recorded
  bytes and loses provenance.
- **Action:** repo edition for the repository history; Production edition for
  the Production history; checksums and a mapping row for both. Never `cp`
  them into one directory.

### 3.2 `20260922081824_restrict_platform_tenant_management_to_system_owner.sql`

- Repo: 1,924 bytes. Production: 10,443 bytes. Token similarity: **0.029** (the older text normalisation gave 0.133;
  neither is a match).
- The repo file is a `DO` block that reads
  `pg_get_functiondef('public.platform_create_tenant_onboarding(jsonb)')` and
  `platform_update_tenant_subscription(jsonb)`, searches for the old
  “system_owner OR admin” authorization block, and replaces it with the
  system_owner-only block.
- The Production row is a full `CREATE OR REPLACE FUNCTION` rewrite of both
  functions. It includes the authorization change **and** bilingual names,
  trial days, module allow-listing, plan validation and other changes.
- The repo patch's `v_old` string is not present in Production's rewritten
  function body. Applying the repo patch to a database built from Production's
  history would raise `authorization block not found`; applying Production's
  rewrite to a repository-built database is not the same migration either.
- **Verdict:** a genuine conflict, not a copy of the same migration. Neither
  file can stand in for the other.
- **Action:** keep both editions in their own histories. Do not merge. The
  owner must decide which edition is canonical for future schema work; T1 must
  not decide it by overwriting one with the other.

### 3.3–3.5 `20261101120000`, `20261104130000`, `20261104150000`

These are not SQL conflicts. The Production rows are registration notes:

| Version | Row bytes | Note cites | Repo md5 | Repo bytes | Verified |
|---|---|---|---|---|---|
| `20261101120000` | 735 | md5 `83594c7283a327d1851037aedb68a8fe`, 4,635 bytes, 115 lines | matches | matches | yes |
| `20261104130000` | 688 | md5 `f03408224e0877d078e1f37e94a8b300`, 16,581 bytes, 419 lines | matches | matches | yes |
| `20261104150000` | 837 | md5 `471c107ebfcff87c44211bb818b88a8c`, 18,691 bytes, 408 lines | matches | matches | yes |

The notes say the DDL was applied out of band and that the row records applied
status only. The repo files are the source of truth, and their md5 and byte
counts match the notes exactly.

The recovered copies contain the prose, not SQL. Running one through `psql`
would fail; treating it as a migration would also duplicate a version that
already has a real repo file. **Action:** do not keep these three as SQL
migrations. Record them as registration rows; the Production-history build
applies the cited repo file and records the note as provenance.

## 4. Duplicate content that is not a version collision

Content-only matching cannot be one-to-one. Two cases matter:

### 4.1 Two repo files with the same content

`20260503000512_reset_patient_code_to_active_max.sql` and
`20260503000555_71563daa-…sql` are token-identical. Production has one row,
`20260503000554`, whose content matches both. The SQL renumbers patient codes
and calls `setval('public.patient_code_seq', …)`, so applying both is not
necessarily harmless.

This is a repository-side duplicate, not one of the five version collisions.
The mapping marks the Production row `unresolved`, leaves `repo_file` empty,
lists both candidates in `repo_candidates`, and emits a `STOP` action. The repo
preflight also fails with both filenames and versions. It does not pick one.

To proceed, a human must choose:

- if the two repo files are the same historical migration recorded twice, mark
  the group `resolved` with a canonical member and `duplicate_of` on the other;
- if both were genuinely applied at different times, mark the group
  `intentional_reapply` with a reason, and both remain in the repo plan;
- otherwise leave it unresolved and do not build.

The real repo preflight exits 2 on this pair today. That is the intended
fail-closed result, not a test failure.

### 4.2 Two intentional re-applications

`20260826030000_restore_insurance_coverage_rpc_exec.sql` and
`20261025090000_zmed302_restore_coverage_rpc_exec.sql` are token-identical
(they `REVOKE` and `GRANT` the same function). Production has two rows,
`20260825215716` and `20261027174432`, at different times. This is an
intentional re-application, not a duplicate file.

The mapping must use the name/version context to pair them:

- `20260825215716` → `20260826030000`;
- `20261027174432` → `20261025090000`.

A content hash alone would collapse them. The Production-history manifest keeps
both rows. The later row carries
`content_duplicate_of=20260825215716` and a `reapply_reason`; the preflight
requires that annotation and rejects an unannotated duplicate. The two repo
files are also marked `intentional_reapply` in `repo-annotations.json`, so the
repo build applies both. The tests
`test_identical_production_rows_are_not_deduplicated`,
`test_same_content_needs_a_reapply_reason` and
`test_coverage_grant_reapplication_is_kept_and_annotated` prove that content
equality does not delete a row.

### 4.3 The 16 formatting-only recovered files

These recovered files are token-identical to a repo file and should be dropped
from the recovered SQL corpus. They are evidence that the first pass's text
normalisation was too weak, not evidence of missing migrations.

| Recovered version | Repo equivalent |
|---|---|
| `20260803211100` | `20260803210000_system_owner_and_per_branch_invoice_numbering.sql` |
| `20260817093835` | `20260817100000_add_patient_name_language.sql` |
| `20260818065943` | `20260818101000_bilingual_physio_therapists.sql` |
| `20260818104209` | `20260818131000_secure_notification_settings_upsert.sql` |
| `20260823084238` | `20260823140000_provider_subdomain_rate_limit.sql` |
| `20260823145432` | `20260823190000_secure_sensitive_views_and_public_rpc_grants.sql` |
| `20260824094800` | `20260824101000_repair_queue_alert_schedule.sql` |
| `20260824102047` | `20260824101300_restrict_legacy_public_booking_authenticated.sql` |
| `20260824102242` | `20260824101400_remove_legacy_booking_authenticated_grants.sql` |
| `20260825205309` | `20260825230000_platform_save_tenant_branding.sql` |
| `20260826095342` | `20260826145000_booking_resource_capacity_guard.sql` |
| `20260826163744` | `20260826183000_patient_portal_credential_templates.sql` |
| `20260923144215` | `20260923170500_protect_purchase_order_workflow.sql` |
| `20260923145536` | `20260923181000_protect_inventory_ledger.sql` |
| `20260923150131` | `20260923185000_harden_inventory_catalog.sql` |
| `20261021203931` | `20261021190000_gate_legacy_appointment_reminder_enqueue.sql` |

## 5. Recovered corpus: 89 → 68 + 2 + 16 + 3

| Disposition | Count | What to do |
|---|---|---|
| **D. Absent** | 68 | Keep in a separate Production-history corpus. 44 have no near counterpart and are the only new-integration candidates; the other 24 are variants to reconcile first. |
| **C. Same-version conflict** | 2 | Keep as Production editions only. Never copy into `supabase/migrations/`. |
| **B. Formatting duplicate** | 16 | Drop the SQL file; keep a Production-row record that points at the repo equivalent. |
| **A2. Registration note** | 3 | Move to a note/registration record; build applies the cited repo file. Do not treat the prose as SQL. |

Of the 68 absent rows:

- **10** have a strong near match (≥ 0.85 similarity) to an existing repo file.
  They are probably the same logical migration with a later edit, not new
  migrations. Reconcile them; do not add them blindly.
- **14** are related (0.35–0.85). They need manual review.
- **44** have no repo counterpart at ≥ 0.35. These are the best candidates for
  genuinely absent migrations.

Examples of strong near matches:

| Production row | Near repo file | Similarity | Why it is not exact |
|---|---|---|---|
| `20260803195911 multi_branch_staff_access` | `20260803200000_multi_branch_staff_access.sql` | 0.970 | repo adds `v_changed <> 0` to a condition |
| `20260803213241 financial_regression_test_suite` | `20260803220000_financial_regression_test_suite.sql` | 0.969 | repo file is the later identity-fix edition; Production has two rows (`…213241` and `…213332`) |
| `20260822200849 platform_onboarding_rpc` | `20260822160000_platform_onboarding_rpc.sql` | 0.990 | unused declaration / text drift |
| `20260825221231 whatsapp_clinic_events_and_templates` | `20260826040000_whatsapp_clinic_events_and_templates.sql` | 0.891 | template and enqueue logic differ |
| `20260826082639 close_cross_tenant_identity_and_audit_leak` | `20260826090000_close_cross_tenant_identity_and_audit_leak.sql` | 0.948 | repo has an additional policy block |
| `20261105112453 …treasury_close_rigour_optional` | `20261105131000_treasury_close_rigour_optional.sql` | 0.948 | repo has extra revokes |

The full 89-row disposition is in
[`MIGRATION_RECOVERED_DISPOSITION.csv`](./MIGRATION_RECOVERED_DISPOSITION.csv).
The full 486-row Production-to-repo mapping is in
[`MIGRATION_MAPPING.csv`](./MIGRATION_MAPPING.csv).

How to read the mapping CSV:

- `repo_file` is the **exact** mapping for `A`, `A2` and `B`. For `A`/`A2` it
  has the same version; for `B` it is the token-identical file under another
  version.
- For `C`, `repo_file` is blank and `near_repo_file` is the same-version repo
  edition. It is an edition, not a replacement.
- For `D`, `repo_file` is blank. `near_repo_file` is the best candidate at
  ≥ 0.35 similarity, or blank when there is none. It is a review lead, not a
  mapping.
- `repo_candidates` lists every repo file with the same token content (`B`) or
  the same-version edition (`A`/`A2`/`C`).
- `class` is the exclusive Production-side class from §2.1. `match_type` says
  whether the row is exact, re-versioned, a note, a conflict or unmatched.
- `resolution` says how the source was chosen: `same_version`, `unique_name`,
  `single_candidate`, `recovered_exact`, `production_exact`,
  `same_version_conflict` or **`unresolved`**. `unresolved` rows have an empty
  `repo_file` and must stop the build.
- `ambiguity` explains an unresolved row and names every candidate.
  `repo_candidates` is the full candidate list; it is never truncated to one.
- `content_duplicate_of` points a later row at the earlier row with the same
  SQL. `content_duplicate_with` is the reciprocal pointer. Neither field
  removes a row. `reapply_reason` is mandatory on the later row.
- `action` is the human instruction. For a normal row it names the source; for
  an unresolved row it starts with `STOP` and says a human must choose.

The disposition CSV uses `D_absent` for `D_no_exact_match` and
`B_formatting_duplicate` for the recovered copies that are token-identical to a
repo file (a subset of `B_reversioned`).

### 5.1 Repository-only files (17)

Seven have a same-name Production row with different SQL:

| Repo-only file | Production row | Similarity |
|---|---|---|
| `20260803200000_multi_branch_staff_access.sql` | `20260803195911` | 0.970 |
| `20260822160000_platform_onboarding_rpc.sql` | `20260822200849` | 0.990 |
| `20260826020000_restore_authenticated_scope_helper_exec.sql` | `20260825215352` | 0.958 |
| `20260826090000_close_cross_tenant_identity_and_audit_leak.sql` | `20260826082639` | 0.948 |
| `20260826190000_patient_portal_first_login_guard.sql` | `20260826170017` | 0.990 |
| `20260923193000_fix_invoice_inventory_accounting.sql` | `20260923150852` | 0.986 |
| `20261105131000_treasury_close_rigour_optional.sql` | `20261105112453` | 0.948 |

The other ten have no same-name Production row:

`20260627103722_qa_pass2_coupons_matrix`,
`20260812180000_revoke_authenticated_execute_cron_secret_rpcs`,
`20260812200000_restrict_unused_diagnostic_rpcs`,
`20260812203800_restrict_orphaned_coverage_rpc`,
`20260812220000_j01_canonical_rpc_permissions`,
`20260813071500_retire_staff_signup_guard`,
`20260813214500_j03_admin_override_caller_identity`,
`20260813223000_j04_apply_wallet_tx_branch_guard`,
`20260827091000_booking_confirmation_workflow_fixes`,
`20261018140000_f6_version_public_booking_rate_limit`.

Several of these are near-duplicates under a different name (for example
`retire_staff_signup_guard` and `j04_apply_wallet_tx_branch_guard`). “Repo-only”
means “no exact token match”, not “unmerged PR”.

## 6. The five collisions in one rule

> Version and filename are not identity. A repository file and a Production
> row are the same migration only when their token streams match, or when a
> registration note explicitly points at the file and the md5/byte count
> matches.

Consequences:

- two histories, two directories, two manifests;
- no `cp` from two histories into one build directory;
- no duplicate version inside one history;
- duplicate token content is allowed only with an explicit re-application
  annotation;
- every mapping row names the class, the source, the hash and the ambiguity.

## 7. Clean-build design

The current `tools/t1/clean-build.sh` merges the two histories and cannot
prove either one. The replacement design is in
[`CLEAN_BUILD_DESIGN.md`](./CLEAN_BUILD_DESIGN.md). In short:

1. **Repo build** — apply only `supabase/migrations/*.sql`, driven by
   `repo-history.json`; fail on duplicate version, duplicate filename, hash
   drift, non-SQL files, or a cross-history path.
2. **Production build** — apply the 486 Production rows in version order,
   driven by `production-history.jsonl`; 413 rows point at a hash-verified repo
   file, 68 at a recovered SQL file, 2 at an exact Production statement file,
   3 at the repo file cited by a registration note.
3. **Schema comparison** — dump both schemas and compare them with each other
   and with a read-only Production catalog dump. Every difference is classified
   and either accepted in `known-differences.json` or treated as a failure.
4. **Platform base verification** — `platform-base.sql` is currently an
   apply-compatibility mock, not a verified Supabase contract. It must be
   compared object-by-object with a real Supabase reference and pass behaviour
   probes before a clean build is allowed to claim platform equivalence.

### 7.1 History preflight and integrity tests (implemented)

The two histories now have separate manifests and a fail-closed preflight:

| File | Records | Purpose |
|---|---:|---|
| `tools/t1/history/repo-history.json` | 436 | One record per active repository file, repo version order. |
| `tools/t1/history/production-history.jsonl` | 486 | One record per Production row, Production version order. |
| `tools/t1/history/production/sql/20260922051415.sql` | 1 | Exact Production edition of the first same-version conflict. |
| `tools/t1/history/production/sql/20260922081824.sql` | 1 | Exact Production edition of the second same-version conflict. |
| `tools/t1/history/repo-annotations.json` | 2 groups | The unresolved patient-code duplicate and the intentional coverage-grant re-application. |

The manifests are generated once by
`tools/t1/build_history_manifests.py` from the read-only Production export and
the repository tree, then reviewed and committed. The build never infers a
source at runtime.

`tools/t1/history_preflight.py` reads a manifest and verifies, without a
database:

- the exact record count (436 or 486);
- 14-digit versions, unique, strictly increasing in manifest order;
- contiguous Production ordinals 1…486;
- every source path exists and is inside the correct history directory;
- raw SHA-256, byte count and token hash match the manifest;
- a repo source's token hash equals the Production token hash for `A`/`B`;
- a recovered source's body (after the provenance header) equals the
  Production statements hash after trimming only leading/trailing line
  separators; the recovered file adds a separator line, not SQL text;
- a `production` source equals the Production statements hash under the same
  line-separator trimming;
- an `A2` note's cited md5 and UTF-8 byte count match the repo file, and the
  note text hash is recorded;
- duplicate token content is either annotated as a deliberate re-application
  with a reason, or the preflight fails with **both** identities;
- an unresolved row fails the whole manifest; it never falls back to a
  “best” candidate;
- when `--production` is supplied, every row is cross-checked against the
  original read-only export: count, version order, name, raw statement hash and
  token hash. A dropped, added or edited row fails.

Current result at this commit:

```text
repo:       PREFLIGHT FAILED (1) 20260503000512 / 20260503000555 unresolved
production: PREFLIGHT FAILED (1) 20260503000554 unresolved
            candidates: 20260503000512, 20260503000555
```

Both failures are intentional. The repository has two token-identical patient
code files and Production has one row that matches both; Production's row
`20260503000554` cannot name which repo file was actually applied. Until a
human resolves one of those two ambiguities, **neither clean build may run**.
The rest of the 436 + 486 records already pass every structural, hash and
provenance check.

The proof is executable:

```bash
python3 tools/t1/history_preflight.py --history repo --repo . --expect 436
python3 tools/t1/history_preflight.py --history production --repo . --expect 486
# optional, when the read-only Production export is available:
python3 tools/t1/history_preflight.py --history production --repo . --expect 486 \
  --production /path/to/prod_full.json
python3 -m unittest discover -s tools/t1/tests -v
```

The 23 history tests include:

- repo fixture: every file planned exactly once, and an unlisted `.sql` file in
  `supabase/migrations/` fails the manifest;
- repo real data: with a temporary `intentional_reapply` annotation for the
  patient-code pair, the plan contains all 436 files, each version once;
- repo fixture: duplicate content without an annotation stops with both files;
- repo fixture: an `intentional_reapply` annotation keeps both files;
- repo fixture: duplicate version, missing file and hash drift are rejected;
- production fixture: all rows planned once, in order, with repo, recovered
  and exact-production sources;
- production real data: with a test-only source for row `20260503000554`, the
  plan contains all 486 rows, ordinals 1…486, in the manifest order; this
  proves retention and order, not the real choice for that row;
- production fixture: out-of-order rows, duplicate versions, missing sources,
  hash drift and cross-history source paths are rejected;
- production fixture: same content needs `content_duplicate_of` and a
  `reapply_reason`; with the annotation, both rows remain in the plan;
- production export cross-check: a dropped row or changed SQL in the original
  read-only export fails the manifest;
- real data: the repo preflight stops on the patient-code pair, the Production
  preflight stops on `20260503000554`, and both manifests contain every row
  exactly once.

The matcher test `test_semantically_different_statement_sequences_are_not_merged`
proves that the same tokens in a different statement order, or the same inner
statements inside a `DO` block instead of at top level, do not hash equal. The
ambiguity test `test_ambiguity_never_auto_selects_a_candidate` runs the same
ambiguous input twice, checks that both candidates are still listed, and checks
that `repo_file` stays empty with a `STOP` action both times.

No test writes to a database and no test edits a migration.

## 8. Platform base: what “verified” means

The current file declares roles, `auth.uid()`, `auth.jwt()`, `auth.role()`,
`storage.buckets`, `storage.objects`, `realtime.messages`, `vault.secrets`,
`cron.job`, `cron.schedule()` and `net.http_post()`. It is enough to let some
migrations apply; it is not a model of Supabase:

- `auth.uid()` reads only `request.jwt.claim.sub`; real Supabase also reads
  `request.jwt.claims->>'sub'`. A test that sets only the JSON claims would see
  `NULL` here and could pass or fail for the wrong reason.
- `auth.jwt()` returns `{}` and `auth.role()` hard-codes `authenticated`.
- `storage.objects` has no RLS, policies, owner or uniqueness contract.
- `cron.job` lacks the real columns; `cron.schedule()` always returns `1`.
- `net.http_post()` always returns `1`; real `pg_net` is asynchronous.
- `vault.decrypted_secrets` is a view over plaintext, not the real vault
  decrypt path.
- role memberships (`authenticator` → `anon`/`authenticated`/`service_role`)
  and default privileges are not modelled.

Verification plan:

1. Start a real Supabase stack at the same engine/CLI generation as Production
   (`supabase start`, or a disposable preview branch).
2. Dump the platform schemas and roles (`auth`, `storage`, `realtime`, `vault`,
   `cron`, `net`, `graphql`, `extensions`, `supabase_migrations`,
   `supabase_functions`), including signatures, RLS flags, grants, default
   ACLs and role memberships.
3. Diff `platform-base.sql` against that reference. Every omitted object is
   recorded as `intentional_subset` with a reason and a test proving no
   migration uses it.
4. Run contract probes on both the reference and the base: `auth.uid()` from
   both claim formats, `auth.jwt()`, `auth.role()`, `storage.foldername()`,
   `cron.schedule()` + `cron.job`, `net.http_post()`, `service_role` RLS
   bypass, `anon`/`authenticated` non-bypass, vault decrypt access.
5. Only then may the base be called a platform contract. Until then its header
   must say **apply-compatible only**; a green clean build proves that the
   repository SQL can run on this declared base, not that the base is Supabase.

## 9. What remains, in order

1. **Freeze the two histories** — generate `repo-history.json` (436) and
   `production-history.jsonl` (486); split the recovered corpus into
   68 absent + 2 conflict + 16 duplicate records + 3 notes. No migration edits.
2. **Implement the two clean builds** — `--history repo|production`, fail
   closed on the five collision classes, and never mix directories.
3. **Verify the platform base** — reference dump + object diff + behaviour
   probes; label the base honestly.
4. **Compare schemas** — repo build vs Production build vs Production catalog;
   document every difference, including the treatment-plan invoice trigger that
   exists only in Production (#281 assumes it).
5. **Only then start replay-safety** — one migration at a time, each with a
   test that fails before and passes after. The first known stop is
   `20260502234939`, which runs `setval('patient_code_seq', 0)` on a fresh
   sequence; that is a replay-safety bug in a historical migration, not a
   platform gap.
6. **Reconcile versions deliberately** — keep repo versions canonical for the
   repository history and Production versions as provenance. Do not re-key the
   repo to Production versions just to make the counters agree.
7. **Re-apply #280/#281/#282 on the restored history** and prove they compose.
8. **Only then mark T1 complete.** CI green and a Workers build are not the
   acceptance test.

## Boundaries

- No `migration repair`; no edit to `schema_migrations`; no replay on
  Production.
- The recovered SQL is verbatim Production text, not authored intent.
- This review does not change any migration SQL or recovered SQL. It updates
  the recovered manifest metadata, adds a README that says the corpus is not
  active, and adds a warning header to the old `clean-build.sh`. The real split
  of the corpus and the new harness are the next step, not this review.
