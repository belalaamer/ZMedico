# Production ↔ repo patch manifest — every artifact Production runs that the published repo did not contain

Staged locally under `work/repo-patch/`, published in this branch at `docs/PRODUCTION_PATCH_MANIFEST.md`. Built 2026-10-22. Production ref `rqcmnfzfytyyicelvifk`. Published repo `https://github.com/belalaamer/ZMedico`, base tip `904037c718e4186540d84d6a8b36b9e3b0f71751` — **read live this session** (`git ls-remote origin refs/heads/main` → that sha; then `git fetch --no-tags origin main` moved the local clone's `origin/main` `24467a8..904037c`. Fetch only: `HEAD` stayed `7b40121`, the 257 dirty working-tree paths untouched).

Every number below is measured, not recalled: staged bytes from `work/repo-patch/`, tip bytes from `git show 904037c…:<path>`, Production bytes from `get_edge_function` readbacks.

Receipts named as `outputs/…` or `work/…` are the local audit trail of the sessions that produced this patch set; they are **not** published in this branch, which carries only the 25 artifacts below plus this document.

---

## 1. State of this patch set

| | |
|---|---|
| Files staged locally | 25 (17 function files + 8 migrations). The 17 function files are 11 `index.ts` — the 9 patched by ZMED-279/285/286/287/288/289 plus the 2 orphans recovered off Production (§3.1) — 4 per-function `_shared/cors.ts` copies, the repo top-level `_shared/cors.ts` and `admin-export/_shared/active-session.ts` |
| Files published on this branch | 22 + this manifest: the 11 `index.ts`, 8 migrations, and only the 3 per-function `cors.ts` copies that some source actually imports (the other 2 staged `_shared` files are byte-identical to what the tip already has — §4 explains the subset) |
| Deployed to Production | **all 11 functions** and **7 of the 8** migrations. The 9 patched functions are byte-identical to the staged file (§3), the 2 recovered orphans are byte-identical to the Production readback they were reconstructed from (§3.1), and the 7 migrations are verified by `pg_get_functiondef` md5 against the same files (§5). `20261018140000` is **staged only and deliberately not applied**: Production already holds those objects, and its version sorts before a published migration on purpose (§5.1) |
| Published to the repo | **this branch** — see §6 |
| Safe to `supabase db push` from here | **no** — measured this session, not assumed: Production records **468** rows in `supabase_migrations.schema_migrations`, the repo tip carries **410** migration files, and only **66** version prefixes are common to both (344 repo-only, 402 Production-only). Every file here is named by the `version` Production recorded, so `migrate` applies them individually and skips the seven already in. Bulk replay of the repo's history against Production is explicitly out of scope and prohibited by the standing brief |

## 2. What this patch set proves about the repo

Measured per patched function: lines present in published `main` that are **absent from the artifact Production runs**.

| function | tip lines | deployed/staged lines | PR diff lines | only-in-tip |
|---|---|---|---|---|
| `send-reminder` | 573 | 639 | 130 | 32 |
| `enqueue-winback` | 142 | 237 | 161 | 33 |
| `enqueue-physio-followups` | 115 | 177 | 132 | 35 |
| `enqueue-lead-followups` | 96 | 163 | 133 | 33 (96 == the v8 base byte-for-byte, so this diff is purely the fix) |
| `admin-export` | 180 | 180 | 18 | 9 |
| `meta-ads-sync` | 298 | 372 | 114 | 20 |
| `meta-ads-connection` | 262 | 277 | 17 | 1 |
| `patient-portal-invite` | 118 | 129 | 29 | 9 |
| `patient-portal-reset-password` | 118 | 127 | 57 | 24 |

The `only-in-tip` lines are **pre-fix code**: `patient-portal-invite` still carries `if (patientError || !patient) return jsonResponse({ error: "Patient not found" }, 404)` and the disclosure-before-authorization ordering that ZMED-285 F-3 closed; `admin-export` still pins `https://esm.sh/@supabase/supabase-js@2.45.0` and the branch-link check that F-4 replaced; `send-reminder` still selects without `whatsapp_opt_in` and caches `{ phone, email }` only.

So the direction of travel is one-way and this is the load-bearing conclusion:

> **Published `main` is behind Production on all nine functions.** Pushing this patch set is forward-only — it publishes what Production already runs. It does **not** overwrite unpublished work, because the repo-side lines it removes are exactly the code Production stopped executing. Anyone who instead re-deploys `main` today would roll back ZMED-279, ZMED-285, ZMED-286, ZMED-287, ZMED-288 and ZMED-289 in one action.

This is the same fault line as F-6 — `public-booking-submit` and `ai-gemini-smoketest` ran with no repo source at all — now quantified, and now closed for the eleven functions on this branch (§3.1). Before this patch set the repo could not be used to rebuild or roll back Production.

## 3. Functions — Production identity and staged bytes

| slug | v | `verify_jwt` | bundle layout | `ezbr_sha256` | staged `index.ts` (md5 / lines / bytes) | readback verdict |
|---|---|---|---|---|---|---|
| `send-reminder` | 17 | false | flat `source/index.ts` + `_shared/cors.ts` | `1f3bbbd3b5ad108503acbefa2ec445cd60054db509e03940ce362be0a4b1d81e` | `c91b991ddd4430511fdf1ac9ebc5d071` / 639 / 27522 | IDENTICAL, `deno check` 0 |
| `enqueue-winback` | 10 | false | flat, single file | `5bebf040ee12498a5f1bcaed3cbe10100e9553d7230cab1749974d034cb84cd5` | `752d73e1752e86062a3a225c8eaf0f41` / 237 / 9938 | IDENTICAL, controls 1/1/1 |
| `enqueue-physio-followups` | 10 | false | flat + `_shared/cors.ts` (742) | `c9e2bcc5ca0b4edd40315fbe229b1d9128149a9c9898f9636f84fe9ef4e2fb69` | `d9ae08486eb6860b1ecc6e0fff1b0104` / 177 / 8077 | IDENTICAL, `deno check` 0 |
| `enqueue-lead-followups` | 9 | false | flat + `_shared/cors.ts` (743) | `7820da4a3ba4b60b47512139123c2c8bf47dd293bead8807b34b02a2c2f08243` | `5c2b1d17890a63df312a6ab51ca08c39` / 163 / 6211 | IDENTICAL, `deno check` 0, running (id 11009) |
| `admin-export` | 11 | **true** | **nested** `source/admin-export/index.ts` + `source/_shared/*` | `45b5d146e2270862382c04bfa44ff77712ef8e103ad6cdd0a82227f42089c060` | `04b8ba7627d219767f2565d83bc568c0` / 180 / 6784 | IDENTICAL |
| `meta-ads-sync` | 8 | true | flat, single file | `04a12edad35b9bb3c6b624b1decbf813636706b90ca9d501df66e55b98e9ab2f` | `977abf5500def5f0456c5771a449f052` / 372 / 18517 | IDENTICAL |
| `meta-ads-connection` | 12 | true | flat, single file | `81ed7d9470b9185b0718ad342916f446ddfa2c432a541849f0149836ecfeccd6` | `48718631153c404335e75f029525c869` / 277 / 14978 | differs only by trailing newline (disclosed, not smoothed) |
| `patient-portal-invite` | 9 | true | flat, single file | `97003ef0c78d33013aa8a957bd2664987112356571c996e80817d5b08bcce3c8` | `ef5d97da5353ba591c0da9a8a7660d2c` / 129 / 7548 | IDENTICAL |
| `patient-portal-reset-password` | 3 | true | flat, single file | `c53dae2f739bd0d8d2ee650c711d6b1129b9c76fdbe37c57f83b309f79de60a8` | `a6667a1b55c6d697c19951d0682f47b8` / 127 / 5468 | IDENTICAL |

### 3.1 The two functions that ran with no repo source at all (F-6)

Both were pulled off Production with `get_edge_function` and re-verified against the staged file this session (`cmp` exit 0 in both cases), so the repo now holds the artifact Production executes:

| slug | v | `verify_jwt` | `ezbr_sha256` | staged `index.ts` (md5 / lines / bytes) | what it is |
|---|---|---|---|---|---|
| `public-booking-submit` | 2 | **false** | `58c3ace9a20d642c0bad156b5246ab3a3a310093435da500fa51d5c26dfb5f51` | `5373dc3375bf877cdb76c8a637ddbde6` / 140 / 4953 | the public `/book` entrypoint. Inline CORS (no `_shared/`), 24 576-byte body cap, `cf-connecting-ip` → `x-forwarded-for` → `"unknown"`, two `consume_public_booking_rate_limit` calls (ip 20/3600 s, phone+ip 6/21600 s) keyed on `sha256Hex` digests it builds itself, then `public_create_booking_for_tenant`. 503 on RPC error, 429 on throttle, 409 only when the message contains `slot_unavailable`. Uses `npm:@supabase/supabase-js@2.111.0` |
| `ai-gemini-smoketest` | 9 | true | `9747583723a7daa1b6445ab4170af890a75e855d1a20b0006758d57a58663b00` | `1a243c55f5f845a0ea1542323e580de4` / 15 / 723 | **already decommissioned on the server**: `Deno.serve` returns `410 Gone` unconditionally and never touches `GEMINI_API_KEY` or `ai_provider_config`. Measured: no repo `src/` call site, no `cron.job` command references it. Publishing it is archiving, not enabling |

Because the smoketest is a 410 stub, the "close it if it is a vulnerability or a cost" question is already answered by the deployed artifact itself — nothing here spends money or exposes a surface. Removing the slug from the project is a dashboard action (`Edge Functions > ai-gemini-smoketest > Delete`) and is **not** part of this patch set.

## 4. Shared modules — two byte-different copies of `cors.ts` are live, do not "unify" them

| staged path | md5 | bytes | lines | shipped by |
|---|---|---|---|---|
| `functions/_shared/cors.ts` | `1baf08cf90d1db93fedf522be02ff95a` | 742 | 19 | repo top level; identical to the copies inside `send-reminder` and `enqueue-physio-followups` bundles |
| `functions/send-reminder/_shared/cors.ts` | `1baf08cf…` | 742 | — | send-reminder v17 (byte-compared `cmp` exit 0 against the fetched bundle) |
| `functions/enqueue-physio-followups/_shared/cors.ts` | `1baf08cf…` | 742 | — | physio v10 (same check) |
| `functions/enqueue-lead-followups/_shared/cors.ts` | `231f22cbc85ad3746583936afcb5464e` | 743 | 20 | lead v9 |
| `functions/admin-export/_shared/cors.ts` | `231f22cb…` | 743 | 20 | admin-export v11 |
| `functions/admin-export/_shared/active-session.ts` | `1c4f9233412402d2a359586e004dac1a` | 955 | 22 | admin-export v11; imports `./cors.ts` |

The 742/743 pair differs by **one trailing newline only** and both are live; contents otherwise match `functions/_shared/cors.ts` exactly. Keeping them separate in the patch set is deliberate: it is what the bundles contain, and normalising the newline would make a future `deploy_edge_function` upload differ from the artifact that was verified.

**What the repo can actually hold.** A repo working tree has one `_shared/` per function directory or one at top level — it cannot carry two variants of the same filename in the same place. So the published set (§1) is:

* `supabase/functions/_shared/cors.ts` — **unchanged**, already `1baf08cf…`/742 at `904037c`, byte-equal to the staged copy. Same for `_shared/active-session.ts` (`1c4f9233…`/955), which is why `admin-export` needs no per-function copies in the repo even though its bundle carries them.
* `supabase/functions/{send-reminder,enqueue-physio-followups}/_shared/cors.ts` (`1baf08cf…`/742) and `supabase/functions/enqueue-lead-followups/_shared/cors.ts` (`231f22cb…`/743) — **added**. These three sources import `"./_shared/cors.ts"`, which is dangling at the tip; publishing the copies both removes the dangling import (the `TS2307` that broke `deno check` on a naive checkout in the ZMED-279 first attempt) and reproduces the flat bundle layout Production runs.
* One disclosed residual deviation: `admin-export` v11 runs against a **743**-byte `_shared/cors.ts` in its bundle while the repo's top-level copy is the 742-byte one. Re-deploying `admin-export` from the repo would therefore differ from the verified artifact by that trailing newline. Its own `index.ts` is byte-exact. The top-level file was **not** rewritten to 743: five other nested-layout functions import it and this program never measured which variant their bundles hold, so changing it could silently move five live artifacts to buy fidelity for one.

Verified on this branch, host `deno check`: `enqueue-lead-followups/index.ts` checks **exit 0** from the worktree. `send-reminder` and `enqueue-physio-followups` fail only inside `https://jsr.io/@supabase/supabase-js/2.117.2/src/index.ts:26` on a transitive `npm:@supabase/realtime-js@2.117.2` this host cannot resolve — not on the local module, and no `TS2307` anywhere in their output. Isolated control (a file whose only import is `"./_shared/cors.ts"`, checked with and without the copy beside it): **without** it, `TS2307 [ERROR]: Cannot find module '…/_shared/cors.ts'`; **with** it, clean exit 0. So the three copies are what close the dangling-import fault, measured rather than assumed.

Bundle layouts that a deploy must reproduce:

* flat — entrypoint `…_<v>/source/index.ts`, imports `"./_shared/cors.ts"` (`send-reminder`, `enqueue-physio-followups`, `enqueue-lead-followups`).
* nested — entrypoint `…_<v>/source/<slug>/index.ts`, `_shared/` sits one level up, imports stay `"../_shared/…"` (`admin-export` v11 fetched and confirmed). This is also `admin-create-user` v15, `admin-delete-user` v10, `detect-queue-alerts` v9, `manage-custom-domain` v14 (`_9`), `whatsapp-webhook` v12 (`_11`), `send-patient-portal-message` v7 (`_2`) — the numeric lag in those entrypoint paths is cosmetic, the `ezbr_sha256` matches the current bundle.
* published `main` at `904037c` keeps a **single** `supabase/functions/_shared/` and no per-function copies, yet three repo files import `"./_shared/cors.ts"`. Those imports are dangling in the tip and resolve only because the deployer copies the file into the bundle — this is why `deno check` on a naive repo checkout fails with `TS2307` (hit in the ZMED-279 first attempt). This branch fixes it by publishing the three copies (§4).

## 5. Migrations

| version | staged file | md5 | bytes | lines | Production `schema_migrations` row | at repo tip? |
|---|---|---|---|---|---|---|
| `20261018140000` | `20261018140000_f6_version_public_booking_rate_limit.sql` | `b078863e04bb876598b21709abd7042c` | 6243 | 118 | **absent — intentionally never applied** (§5.1) | no |
| `20261022012133` | `20261022012133_zmed279_whatsapp_consent.sql` | `9a945fc3b05ccd7605102580d286baa3` | 8067 | 185 | present, stored `name` = `20261022120000_zmed279_whatsapp_consent` | no |
| `20261022013136` | `20261022013136_zmed286_lead_spend_branch_scope.sql` | `4f5a9adb5e397d5ec3fcdeeff3974301` | 6938 | 157 | present, stored `name` = `20261022123000_zmed286_lead_spend_branch_scope` | no |
| `20261022084754` | `20261022084754_zmed290_booking_expiry_in_app_alert.sql` | `eb8ca654f6289c2c2265a8473816d4ff` | 5839 | 121 | present, stored `name` = `20261022130000_zmed290_booking_expiry_in_app_alert` | no |
| `20261022084812` | `20261022084812_zmed291_cron_secret_fail_loud_and_queue_timeout.sql` | `3adb6019d686ae7efd95267f8e1279dc` | 3658 | 80 | present, stored `name` = `20261022131000_zmed291_cron_secret_fail_loud_and_queue_timeout` | no |
| `20261022084845` | `20261022084845_zmed291_cron_health_monitor.sql` | `fcb8b5fb15e4cc47dada2d37c6ec3c08` | 6510 | 147 | present, stored `name` = `20261022132000_zmed291_cron_health_monitor` | no |
| `20261022085312` | `20261022085312_zmed291_cron_health_pg_net_leg.sql` | `a655dd51f828692ed88e1d6029ac2c1d` | 5587 | 130 | present, stored `name` = `20261022133000_zmed291_cron_health_pg_net_leg` | no |
| `20261022115129` | `20261022115129_f6_harden_public_booking_key_hash.sql` | `7bc57be1fc6b0c5908cb4c29439d37e8` | 5567 | 108 | present, stored `name` = `20261022160000_f6_harden_public_booking_key_hash` | no |

The four cron-touching files (`20261022084754` → `20261022085312`) are the first migrations in this repository that also touch `cron.job`: each ends in a `DO $migration$` block that registers or re-points a scheduled job, so a rebuilt environment reproduces jobs 6, 12, 16 and 17 instead of losing them. They must therefore be **re-runnable**: every one uses skip-when-identical (`IF v_command IS DISTINCT FROM …`), because `cron.alter_job()` and `cron.unschedule()` fail with `could not find valid entry` on any environment whose pg_cron worker does not hold the job in shared memory, and `DELETE FROM cron.job` is `42501` for the migration role. Re-applying all four on QA changed zero `cron.job` rows (measured, ZMED-292 §6 P5).

Fidelity of the *applied result* is measured, not assumed: `pg_get_functiondef` md5 on Production equals the same function's md5 on the QA stack that received it from these files — `notify_pending_booking_expiry_soon()` `dc6cb47f…`/2701 B, `invoke_reminder_function(text, jsonb)` `4733f0e7…`/1144 B, `assert_cron_health()` `9119a570…`/3533 B. `public.cron_health` relacl on Production is owner-only (`postgres=arwdDxtm/postgres`): a view created here must also revoke `service_role`, because Supabase `ALTER DEFAULT PRIVILEGES` hands every new table to `anon`, `authenticated` **and** `service_role`.

The `version` ↔ `name` disagreement is **not** an artefact of these seven. Re-measured this session over all 468 rows of `supabase_migrations.schema_migrations`: 127 store an empty `name`, and of the 341 that carry one, **328 have a 14-digit prefix that differs from `version`** and only 13 match. An earlier draft of this file claimed "454 of 467" by counting the empty names as divergences; that number was wrong and is corrected here. `version` is the apply timestamp the tool writes, `name` is the label passed at apply time, and `version` is the identity the CLI compares — so the staged filenames use it (which is why the hardening file is published as `20261022115129…`, the version Production recorded, and not as the `20261022160000…` label it was applied under). Nobody should diff migration history by `name`. The tip carries 410 migration files, latest `20261021190000_gate_legacy_appointment_reminder_enqueue.sql`.

### 5.1 The F-6 file, and the replay bug it exposes

`20261018140000_f6_version_public_booking_rate_limit.sql` versions the public-booking throttle — table `public_booking_rate_limits`, its index, its ACL and `consume_public_booking_rate_limit(text, integer, integer)` — copied from live Production reads, not from a design doc. Its version is deliberately **earlier** than several already-applied Production migrations because of what the read revealed:

the published tip file `20261018142245_enforce_live_actor_data_boundary.sql` ends with `create policy zmedico_live_actor_boundary on "public"."public_booking_rate_limits" as restrictive …`, and **no migration anywhere in the tip creates that table** (`git grep public_booking_rate_limits` at `904037c` returns that one file; `consume_public_booking_rate_limit` returns nothing). So the repository's own history is not replayable: on a fresh database it aborts at `20261018142245` with `relation … does not exist` — reproduced on QA, error `42P01`, receipt `outputs/ZMED-F6-qa-receipt-2026-10-22.json` (run `ZMED-F6-1792660998197`, 19/19, exit 0). With this file sorted first, the same tip statement succeeds and produces exactly Production's policy row.

Two things that file also settled, both contradicting an earlier draft of the F-6 finding:
* there is **no** `anon`/`authenticated` EXECUTE grant on the throttle — live `proacl` is `{postgres=X/postgres, service_role=X/postgres}` and `relacl` is `{postgres=arwdDxtm/postgres, service_role=arwdDxtm/postgres}`, so it is not reachable from PostgREST;
* the restrictive policy targets `authenticated`, which holds no table privilege, so it can never be exercised — RLS narrows a grant, it never creates one. Reproduced only because Production holds it.

Measured drift found while proving the rebuild: **QA does not have `zmedico_live_actor_boundary` on this table** while Production does (`11a`), which is why the harness compares against Production's own row rather than against QA's.

### 5.2 The `key_hash` hole, and why it sorts last

`20261018140000` recreates `consume_public_booking_rate_limit` **as Production had it** — including the defect that `key_hash` stored `p_key` verbatim (`VALUES (p_key, …)`), so any caller could turn an identifier column into a plaintext store. That is deliberate: the F-6 file's job is to make the tip replayable, so it mirrors the object it versions and changes no behaviour.

`20261022115129_f6_harden_public_booking_key_hash.sql` then closes it, and because `20261022115129 > 20261018140000` a rebuild ends in the hardened definition, which is what Production runs. It folds `p_key` into `lower(encode(extensions.digest(convert_to(p_key,'utf8'),'sha256'),'hex'))` inside the function, adds `CHECK (key_hash ~ '^[0-9a-f]{64}$')` so a direct INSERT or a regressed function is refused rather than accepted quietly, and re-asserts the grant set. Signature, guards, window maths, `RETURN v_count <= p_limit`, `SECURITY DEFINER` and the `search_path` pin are unchanged. QA receipt `outputs/ZMED-F6-hardening-qa-receipt-2026-10-22.json`.

Answer to "does any live key need updating?" — **no**, measured: all three throttle tables (`public_booking_rate_limits`, `login_rate_limits`, `subscription_request_rate_limits`) held 0 rows when this was written, both live callers (`public._create_booking_for_patient` and the `public-booking-submit` Edge Function) already passed a SHA-256 hex digest, and throttle keys are derived per request and never read back. The only observable effect was that in-flight buckets started fresh, for one window.

Deliberately **not** in scope: `consume_login_rate_limit` and `consume_subscription_request_rate_limit` store their argument the same way in `bucket_key`, but both already reject `p_key` outside 32..128 characters, and the login one sits on the authentication path — reported as a proposal, not changed.

## 6. Publication state

Everything in §1 is published on this branch from a **clean worktree at `904037c`** — no file from the local clone's 257 dirty working-tree paths is in the commit, and the uncommitted refactor (`_shared/followup-input.ts`, `followup-pages.ts`, `ai-*.ts`, `whatsapp-delivery.ts`, `employee-id.ts` variants, the 103-line `enqueue-lead-followups`) stays unpublished for review on its own terms.

Two constraints that shaped this and still apply to anyone merging:

* `20261018140000` must land **with** the existing migrations, not after them — it is what makes the tip's own history replayable (§5.1).
* Nothing here changes Production. Production already runs these bytes; the migrations in §5 are already recorded in `supabase_migrations.schema_migrations`.

Merging this branch is a documentation/rebuild-ability change only. It closes the F-6 gap ("the repo cannot rebuild or roll back Production") for the eleven functions and eight migrations listed above; it does **not** reconcile the remaining 402 Production-only rows or the 344 repo-only files, and §1's `db push` warning stands.

## 7. Do-not-do list attached to this patch set

* Do not `supabase db push` the repo against Production. The brief forbids bulk migration-history replay, and the measured overlap is 66 of 468 rows.
* Do not re-deploy from the old `main`: it rolls back nine functions (§2).
* Do not "fix" the two `cors.ts` variants into one file (§4).
* Do not treat the recovered `ai-gemini-smoketest` source as live capability — it is a deployed 410 stub (§3.1), and deleting the slug from the project is a separate dashboard action.
* Test data already removed, and how to restore it: the two QA test leads were hard-deleted on 2026-10-22 under explicit owner instruction (restore script `work/qa-lead-deletion-restore-2026-10-22.sql`); the rows they left behind — synthetic patient code 37 + appointment `BZ-2026-000007`, and appointment `BZ-2026-000008` — were then hard-deleted too, again by name under authorization, with **real** patient_code 34 left untouched (restore script `work/zmed-patient37-appointments-restore-2026-10-22.sql`, receipt ZMED-292 §7). The one browser-verification booking (`BZ-2026-000017`, synthetic patient code 39) was deleted the same day it was created — receipt `outputs/ZMED-290-browser-alert-verification-2026-10-22.md`. Nothing outside those named rows is authorised for deletion, and no authority should be inferred for further data edits.
* Do not edit a live `cron.job` command without the skip-when-identical guard (§5). `cron.alter_job`/`cron.unschedule` operate on the worker's shared-memory copy and raise `could not find valid entry` for a job that is plainly in `cron.job`, so an *unnecessary* alter fails the whole migration.
* Do not make `public.cron_health` or `public.assert_cron_health()` client-callable, and do not let either send anything. The monitor is read-only by design: its alarm channel is `cron.job_run_details.status`, not a provider call.
* Do not put any secret value in this repo. The Edge Functions read their credentials from the Supabase project's secret store; §3.1's `public-booking-submit` reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the runtime environment, never from a file.

## 8. What has been *run*, not just staged — evidence levels

A build passing or a `smoke` tick succeeding is not proof of a flow. These are the levels each part of this patch set was actually checked at:

| artifact | Source | SQL | Auth/API | Browser |
|---|---|---|---|---|
| 11 `index.ts` | `cmp` exit 0 against the deployed bundle for every one (§3, §3.1); `deno check` exit 0 recorded per function where it was run | n/a | n/a | booking leg exercised end-to-end through `public-booking-submit` (§8.1) |
| `20261022012133` (ZMED-279 consent) | — | applied on QA then Production; differential harness proved dispatch-time consent blocks historical rows | — | — |
| `20261022013136` (ZMED-286 spend scope) | — | applied on QA + Production | QA differential, 8 runs | — |
| `20261022084754` (ZMED-290 alert) | — | `pg_get_functiondef` md5 `dc6cb47f…` on Production = QA build from this file | — | **yes, Production, 2026-10-22** |
| `20261022084812/…84845/…85312` (ZMED-291 cron) | — | re-applied on QA, 0 `cron.job` rows changed; `assert_cron_health()` md5 `9119a570…` | — | — |
| `20261018140000` (F-6 version) | — | 19/19 on a fresh QA stack, exit 0 (`outputs/ZMED-F6-qa-receipt-2026-10-22.json`) | — | — |
| `20261022115129` (key_hash hardening) | — | QA receipt `outputs/ZMED-F6-hardening-qa-receipt-2026-10-22.json`, then Production | — | see §8.2 — live hashed buckets |

### 8.1 The one browser-level proof, in short

Production, tenant `blitz-physio` (the only bookable tenant), through the real deployed Worker at `https://zmedico2.belalaamer.workers.dev/book?tenant=blitz-physio`: the UI created appointment `661078c2-961d-421f-be6d-48ad5b7f5805` / reference `BZ-2026-000017` with a synthetic patient, and that row was placed into the exact `pending` + expiry-window shape that the `require_confirmation = true` branch writes (this tenant's single `appointment_settings` row has `require_confirmation = false`, so the UI cannot emit `pending` — flipping live tenant config was not authorised and was **not** done; its `updated_at` is identical before and after).

Then, on Production clocks: pg_cron job 16 tick `succeeded` at `12:23:00.019396` and set `booking_expiry_alert_sent_at` in the same tick; **exactly 8** `notifications` rows with `type = 'alert'` landed for the branch's `admin`/`manager`/`receptionist` staff; the `system_owner` account, which is not in `staff_branches`, correctly received none; a second tick on the same row inserted nothing (idempotent); job 15 `succeeded` at `12:28:00` and flipped the row to `cancelled` / `expired`.

The `type = 'alert'` choice is what makes this safe and it was proven, not asserted: inserting the same `(user_id, related_entity_id, 'appointment')` triple raised `23505` verbatim — `Key (user_id, related_entity_id, type)=(…) already exists.` — against `idx_unique_appointment_notification`, which is the failure that made ZMED-290 break on its first real run.

Zero provider traffic was caused by any of this: the alert is an in-app row only, and the synthetic booking, its notifications and its patient were hard-deleted the same day, restoring the measured baseline counts (receipt `outputs/ZMED-290-browser-alert-verification-2026-10-22.md`).

### 8.2 Live proof of the `key_hash` hardening under real traffic

Same booking, different claim: it consumed 2 buckets in `public.public_booking_rate_limits`, and **both stored rows are 64-character lowercase hex digests** (`is_hex64 = true`, `attempt_count = 1`) with no plaintext IP or phone anywhere in the column. That is Production data written by the real `public-booking-submit` path after `20261022115129` was applied — not a probe that was rolled back afterwards.

The 2 rows are left in place deliberately. They hold no personal data (the inputs were already digests), and the `cleanup-public-booking-rate-limits` cron job deletes stale buckets daily at 03:17, so they age out on their own.
