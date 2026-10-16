# ZMED-256 / ZMED-257 — inventory client submission safety

Scope: frontend only, no migration, grants, RLS, data correction, role changes or new RPC. Based on released main a95e8f8, not the unrelated dirty audit checkout.

## ZMED-256 — repeated inventory submissions

Severity P1. Stock adjustment, transfer and partial purchase receipt handlers awaited RPC without a synchronous lock. Rendered baseline tests each produced two RPC calls for two quick Save clicks. Draft edit had state-only busy handling without catch/finally; thrown transport errors could leave it stuck. Raw backend errors were exposed in both pages.

Minimal shared hook acquires a ref lock before awaiting, exposes busy state, releases in finally, suppresses stale completion after actor/branch/order changes or unmount via existing useOperationScope, and reports uncertain outcomes without raw error details. No auto retry. Dialog dismissal and editing are blocked while pending. PO submission, draft save, receipt and cancellation share one lock. Diagnostics log only a bounded SQL/error code, never raw message, stack or request body.

## ZMED-257 — negative adjustment reverses the chosen operation

Severity P1. Quantity validation used truthiness; HTML min is not enforced by an onClick handler. Baseline rendered tests show Add -1 sends signed_qty -1, Remove -1 sends +1. Backend signed quantities legitimately support removal, so blocking all negative signed values there would break valid operations. Correct fix validates finite positive input before computing the sign; transfer input uses the same finite check. Valid Add1/Remove1 payloads remain +1/-1. Existing count/set semantics are not redesigned.

## Evidence / release gate

23 new rendered/hook cases plus7 existing scope tests passed: duplicate saves, pending Escape/cancel/input blocking, thrown/rejected RPC handling, no raw disclosure/no automatic retry, positive/negative inputs, submit/draft/cancel controls, identity A→B→A and unmount. Initial three duplicate and two negative baseline cases failed for the intended reason before fixes; retained separately, not counted green.

Actual native HTTP/browser acceptance39/39including cleanup passes with exact deployed253inventory core mirrored only locally. Native admin/receptionist Auth, finite guards/role/branch/later-line atomic rollback controls, real browser adjustment+transfer+partial receipt double-click each send one RPC and persist exactly the expected quantity/ledger change; reload has no duplicate/uncaught error. Original local core/owner/grants/RLS restored; all owned product/stock/ledger/order/item/supplier/alerts/4generated notifications removed, actor access/sessions removed and identities banned; audit retained. First browser run reached successful receipt but expected200instead of the voidRPC's correct204; corrected harness contract, no app/server change; its cleanup passed, then complete rerun passed.

New hook/test lint has0errors/0warnings. Existing page baseline lint remains Stock9errors2warnings and PO6errors2warnings, identical rule counts; no lint suppression added. Initial TypeScript check caught unsupported Testing Library exact option; removed test-only option, final checks tracked separately. Full candidate CI/types/build and release verification remain gates. Do not infer all inventory CRUD or multiple-tab/reload idempotency from the scoped browser evidence.

Remaining boundaries: single-flight is per mounted page only; lost-response callers must inspect ledger/order before retrying. No durable cross-tab request key added. Concurrent stock-count/set correctness and existing read-refresh error/stale-data behavior remain separate audit items. Do not bundle staff-role linking, patient portal, AI/provider work or automatic database history synchronization.
