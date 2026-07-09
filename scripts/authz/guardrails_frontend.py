#!/usr/bin/env python3
"""
R3.5 — Frontend Authorization Guardrail.

Statically scans the frontend for authorization decisions that bypass the
canonical `AuthorizationService` adapter (established in R2). Fails when a
banned pattern appears outside the small, explicitly listed compatibility
surface.

Read-only. No behavior changes. Additive to the regression harness.

Banned patterns (outside allowlist):
    - has_role(                     legacy predicate call
    - roles.includes(               raw role identity check
    - isAdmin                       raw admin bypass
    - role === / role ==            raw role comparison
    - usePermissions(               legacy permission hook
    - useUserRole(                  legacy role hook

Allowlist (canonical compatibility surface — R2/R3 references only):
    src/lib/authz/**                AuthorizationService + adapter internals
    src/hooks/usePermissions.ts     legacy hook (wrapped by service)
    src/hooks/useUserRole.ts        legacy hook (wrapped by service)
    src/lib/rolePermissions.ts      permission map (data, not decisions)
    src/lib/systemSelfAudit.ts      documentation strings only
    **/*.test.*, **/*.spec.*        tests

Exit codes:
    0  clean
    2  banned pattern found outside allowlist (strict/CI)
"""
from __future__ import annotations
import argparse, os, re, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SRC  = REPO / "src"

ALLOWLIST_PREFIXES = (
    "src/lib/authz/",
    "src/hooks/usePermissions.ts",
    "src/hooks/useUserRole.ts",
    "src/lib/rolePermissions.ts",
    "src/lib/systemSelfAudit.ts",
)
TEST_MARKERS = (".test.", ".spec.", "/test/", "/tests/")

PATTERNS = [
    ("has_role_call",     re.compile(r"\bhas_role\s*\(")),
    ("roles_includes",    re.compile(r"\broles\s*\.\s*includes\s*\(")),
    ("isAdmin_ref",       re.compile(r"\bisAdmin\b")),
    ("role_eq_literal",   re.compile(r"\brole\s*===?\s*['\"]")),
    ("usePermissions_hook", re.compile(r"\buse[Pp]ermissions\s*\(")),
    ("useUserRole_hook",  re.compile(r"\buseUserRole\s*\(")),
]

def is_allowed(rel: str) -> bool:
    if any(m in rel for m in TEST_MARKERS):
        return True
    return any(rel.startswith(p) for p in ALLOWLIST_PREFIXES)

def scan() -> list[tuple[str, int, str, str]]:
    findings: list[tuple[str, int, str, str]] = []
    for path in SRC.rglob("*"):
        if not path.is_file() or path.suffix not in (".ts", ".tsx"):
            continue
        rel = str(path.relative_to(REPO))
        if is_allowed(rel):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            stripped = line.lstrip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            for name, rx in PATTERNS:
                if rx.search(line):
                    findings.append((rel, lineno, name, line.strip()[:160]))
    return findings

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true", help="exit 2 on any finding")
    args = ap.parse_args()
    findings = scan()
    if not findings:
        print("[guardrails-fe] clean — 0 banned authorization patterns outside allowlist")
        return 0
    print(f"[guardrails-fe] {len(findings)} finding(s):")
    for rel, ln, name, snippet in findings:
        print(f"  {rel}:{ln}  [{name}]  {snippet}")
    return 2 if args.strict else 0

if __name__ == "__main__":
    sys.exit(main())