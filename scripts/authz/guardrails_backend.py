#!/usr/bin/env python3
"""
R3.5 — Backend Authorization Guardrail.

Statically scans SQL migrations and Supabase Edge Functions for
authorization patterns that bypass the canonical model:

  Every new client-callable SECURITY DEFINER function MUST:
    - authorize via `has_permission(auth.uid(), '<key>')`
    - derive actor exclusively from `auth.uid()` (no `_by`/`_actor` params)
    - set a fixed `search_path`
    - not call `has_role(...)` (compat layer only)

Additionally, Edge Functions MUST NOT use `SUPABASE_SERVICE_ROLE_KEY` to
bypass authorization without going through `has_permission()`-gated RPCs.

Scope:
  - Only *newly added* migration files (git-tracked, but comparison-free
    here — we scan every migration and rely on the compat allowlist for
    the historically merged files).
  - Every file under `supabase/functions/`.

Read-only. No behavior changes. Additive to the regression harness.

Exit codes:
    0  clean or advisory
    2  violation(s) found (strict/CI)
"""
from __future__ import annotations
import argparse, re, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MIGRATIONS = REPO / "supabase/migrations"
FUNCTIONS  = REPO / "supabase/functions"

# Migrations landed before R3.5 that legitimately used has_role() or
# lacked has_permission() gating. New migrations MUST NOT extend this
# list without a Product Decision entry.
HISTORICAL_MIGRATION_ALLOWLIST_MARKER = "-- authz-guardrails: legacy-ok"

# Signature params that indicate client-supplied actor trust.
ACTOR_PARAM_RX = re.compile(
    r"\b(_by|_actor|_actor_id|_user_id|_performed_by|_created_by|_updated_by)\b\s+uuid",
    re.IGNORECASE,
)
HAS_ROLE_RX          = re.compile(r"\bhas_role\s*\(", re.IGNORECASE)
HAS_PERMISSION_RX    = re.compile(r"\bhas_permission\s*\(", re.IGNORECASE)
SECURITY_DEFINER_RX  = re.compile(r"SECURITY\s+DEFINER", re.IGNORECASE)
SEARCH_PATH_RX       = re.compile(r"SET\s+search_path", re.IGNORECASE)
CREATE_FN_RX = re.compile(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\((.*?)\)",
    re.IGNORECASE | re.DOTALL,
)

# Edge function guardrails.
SERVICE_ROLE_RX = re.compile(r"SUPABASE_SERVICE_ROLE_KEY")


def scan_migration(path: Path) -> list[tuple[int, str, str]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if HISTORICAL_MIGRATION_ALLOWLIST_MARKER in text:
        return []
    findings: list[tuple[int, str, str]] = []
    # Split into function bodies to check per-function invariants.
    for m in CREATE_FN_RX.finditer(text):
        fn_name = m.group(1)
        params  = m.group(2) or ""
        # Body: from the function header to the next `$$;` terminator
        # (best-effort — enough for guardrail lint, not for parsing).
        start = m.start()
        tail  = text[start:]
        end_marker = re.search(r"\$\$\s*;", tail)
        body = tail[: end_marker.end()] if end_marker else tail
        if not SECURITY_DEFINER_RX.search(body):
            continue  # non-definer helper, out of scope
        line0 = text.count("\n", 0, start) + 1
        if HAS_ROLE_RX.search(body):
            findings.append((line0, f"definer_has_role[{fn_name}]",
                             "SECURITY DEFINER function calls has_role() — use has_permission()."))
        if not HAS_PERMISSION_RX.search(body):
            findings.append((line0, f"definer_no_has_permission[{fn_name}]",
                             "SECURITY DEFINER function has no has_permission() gate."))
        if ACTOR_PARAM_RX.search(params):
            findings.append((line0, f"definer_actor_param[{fn_name}]",
                             "SECURITY DEFINER accepts client-supplied actor param — use auth.uid()."))
        if not SEARCH_PATH_RX.search(body):
            findings.append((line0, f"definer_no_search_path[{fn_name}]",
                             "SECURITY DEFINER function missing SET search_path."))
    return findings


# Pre-R3.5 background/cron edge functions that legitimately use the
# service role (not client-callable). Tracked for R4 migration in
# `docs/execution/runtime/R3_5/AUTHORIZATION_GUARDRAILS_REPORT.md` §4.
EDGE_FN_ALLOWLIST = {
    "detect-queue-alerts",
    "enqueue-winback",
    "send-reminder",
}

def scan_edge_function(path: Path) -> list[tuple[int, str, str]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    findings: list[tuple[int, str, str]] = []
    if SERVICE_ROLE_RX.search(text):
        fn_dir = path.parent.name
        # Allowed: (a) explicit admin-scoped ops (`admin-*`), or
        # (b) legacy background/cron functions on the allowlist.
        if not fn_dir.startswith("admin-") and fn_dir not in EDGE_FN_ALLOWLIST:
            for lineno, line in enumerate(text.splitlines(), 1):
                if SERVICE_ROLE_RX.search(line):
                    findings.append((lineno, "edge_service_role_bypass",
                                     "Non-admin edge function uses SUPABASE_SERVICE_ROLE_KEY — route through an has_permission()-gated RPC."))
    return findings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--since", help="only scan migration files whose basename sorts after this",
                    default=None)
    args = ap.parse_args()

    all_findings: list[tuple[str, int, str, str]] = []

    if MIGRATIONS.exists():
        for path in sorted(MIGRATIONS.glob("*.sql")):
            if args.since and path.name <= args.since:
                continue
            for ln, code, msg in scan_migration(path):
                all_findings.append((str(path.relative_to(REPO)), ln, code, msg))

    if FUNCTIONS.exists():
        for path in FUNCTIONS.rglob("index.ts"):
            for ln, code, msg in scan_edge_function(path):
                all_findings.append((str(path.relative_to(REPO)), ln, code, msg))

    if not all_findings:
        print("[guardrails-be] clean — 0 backend authorization violations")
        return 0
    print(f"[guardrails-be] {len(all_findings)} finding(s):")
    for rel, ln, code, msg in all_findings:
        print(f"  {rel}:{ln}  [{code}]  {msg}")
    return 2 if args.strict else 0


if __name__ == "__main__":
    sys.exit(main())