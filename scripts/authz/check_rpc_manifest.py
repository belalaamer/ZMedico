#!/usr/bin/env python3
"""
RPC Manifest Checker — Authorization v2 · Task RPC-09.

Two-phase validation:
  Phase A  Manifest schema validation (offline, always runs).
  Phase B  Runtime presence + signature validation against pg_proc
           (requires PGHOST; skipped in --offline mode).

Exit codes (distinct, per RPC-09 spec):
  0   success
  10  manifest validation failure
  11  unsupported schema version
  20  runtime drift (missing / signature mismatch past `present_by`)
  30  environment error (runtime requested but PGHOST unset)

The checker never mutates the database.
"""
from __future__ import annotations
import argparse, os, re, subprocess, sys
from pathlib import Path

try:
    import yaml  # PyYAML
except ImportError:
    print("[manifest] PyYAML required: python -m pip install pyyaml", file=sys.stderr)
    sys.exit(10)

# ── Constants ────────────────────────────────────────────────────────────
SUPPORTED_SCHEMA_VERSIONS = {1}
VALID_MILESTONES = {"M1", "M2", "M3", "M4", "M5", "M6"}
VALID_CRITICALITY = {"critical", "high", "medium", "low"}  # optional field, schema v2+
REQUIRED_FIELDS_V1 = {"name", "signature", "permission", "purpose",
                      "present_by", "audit", "introduced_in"}
PERMISSION_KEY_RE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]+)+$")
PROC_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,62}$")

# Milestone ordering for "is this due yet?" logic.
MILESTONE_ORDER = {m: i for i, m in enumerate(["M1", "M2", "M3", "M4", "M5", "M6"])}


# ── Phase A ──────────────────────────────────────────────────────────────
def load_manifest(path: Path) -> dict:
    if not path.exists():
        die(10, f"manifest not found: {path}")
    try:
        with path.open() as fh:
            data = yaml.safe_load(fh)
    except yaml.YAMLError as e:
        die(10, f"malformed YAML: {e}")
    if not isinstance(data, dict):
        die(10, "manifest root must be a mapping")
    return data


def validate_schema(m: dict) -> list[dict]:
    """Returns the normalized rpc list on success; exits on failure."""
    errors: list[str] = []

    # Schema version
    version = m.get("version")
    if version is None:
        errors.append("missing top-level `version`")
    elif not isinstance(version, int):
        errors.append(f"`version` must be int, got {type(version).__name__}")
    elif version not in SUPPORTED_SCHEMA_VERSIONS:
        # Distinct exit code for this specific failure.
        print(f"[manifest] FAIL — unsupported schema version {version} "
              f"(supported: {sorted(SUPPORTED_SCHEMA_VERSIONS)})", file=sys.stderr)
        sys.exit(11)

    if m.get("frozen") is not True:
        errors.append("`frozen` must be true (manifest is not draft)")

    rpcs = m.get("rpcs")
    if not isinstance(rpcs, list) or not rpcs:
        errors.append("`rpcs` must be a non-empty list")
        _report_and_exit(errors)

    # Per-entry validation
    seen_names: dict[str, int] = {}
    seen_perm_sig: dict[tuple, int] = {}
    seen_ids: dict[str, int] = {}
    for idx, rpc in enumerate(rpcs):
        prefix = f"rpcs[{idx}]"
        if not isinstance(rpc, dict):
            errors.append(f"{prefix} must be a mapping")
            continue
        missing = REQUIRED_FIELDS_V1 - set(rpc.keys())
        if missing:
            errors.append(f"{prefix} missing required fields: {sorted(missing)}")
            continue

        name = rpc["name"]
        if not isinstance(name, str) or not PROC_NAME_RE.match(name):
            errors.append(f"{prefix}.name invalid: {name!r}")
        elif name in seen_names:
            errors.append(f"{prefix}.name duplicate of rpcs[{seen_names[name]}]: {name!r}")
        else:
            seen_names[name] = idx

        perm = rpc["permission"]
        if not isinstance(perm, str) or not PERMISSION_KEY_RE.match(perm):
            errors.append(f"{prefix}.permission is not a valid catalog key: {perm!r}")

        sig = rpc["signature"]
        if not isinstance(sig, str):
            errors.append(f"{prefix}.signature must be a string")
        else:
            # A single (permission,signature) tuple should be unique per RPC name;
            # two RPCs sharing exact perm+sig is almost certainly a copy-paste bug.
            key = (name, sig)
            if key in seen_perm_sig:
                errors.append(f"{prefix} duplicate (name,signature) with "
                              f"rpcs[{seen_perm_sig[key]}]")
            else:
                seen_perm_sig[key] = idx

        milestone = rpc["present_by"]
        if milestone not in VALID_MILESTONES:
            errors.append(f"{prefix}.present_by invalid milestone: {milestone!r} "
                          f"(valid: {sorted(VALID_MILESTONES)})")

        if not isinstance(rpc["audit"], bool):
            errors.append(f"{prefix}.audit must be boolean")
        if not isinstance(rpc["purpose"], str) or not rpc["purpose"].strip():
            errors.append(f"{prefix}.purpose must be non-empty string")
        if not isinstance(rpc["introduced_in"], str) or not rpc["introduced_in"].strip():
            errors.append(f"{prefix}.introduced_in must be non-empty string")

        # Optional fields (schema v2+ forward-compat)
        if "id" in rpc:
            rid = rpc["id"]
            if not isinstance(rid, str) or not rid.strip():
                errors.append(f"{prefix}.id must be non-empty string")
            elif rid in seen_ids:
                errors.append(f"{prefix}.id duplicate of rpcs[{seen_ids[rid]}]: {rid!r}")
            else:
                seen_ids[rid] = idx
        if "owner" in rpc:
            owner = rpc["owner"]
            if not isinstance(owner, str) or not owner.strip():
                errors.append(f"{prefix}.owner must be non-empty string")
        if "criticality" in rpc:
            c = rpc["criticality"]
            if c not in VALID_CRITICALITY:
                errors.append(f"{prefix}.criticality invalid: {c!r} "
                              f"(valid: {sorted(VALID_CRITICALITY)})")

    _report_and_exit(errors)
    return rpcs


def _report_and_exit(errors: list[str]) -> None:
    if not errors:
        return
    print("[manifest] FAIL — schema validation:", file=sys.stderr)
    for e in errors:
        print(f"  - {e}", file=sys.stderr)
    sys.exit(10)


# ── Phase B ──────────────────────────────────────────────────────────────
LIST_SQL = (
    "SELECT p.proname, pg_get_function_identity_arguments(p.oid) "
    "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
    "WHERE n.nspname='public' AND p.prosecdef"
)


def pg_functions() -> set[tuple[str, str]]:
    r = subprocess.run(["psql", "-At", "-F", "\x1f", "-c", LIST_SQL],
                       check=True, capture_output=True, text=True)
    out = set()
    for line in r.stdout.splitlines():
        parts = line.split("\x1f", 1)
        if len(parts) == 2:
            out.add((parts[0].strip(), parts[1].strip()))
    return out


def _norm(sig: str) -> str:
    """Normalize a signature for comparison (whitespace / case)."""
    return re.sub(r"\s+", " ", sig.strip().lower())


def validate_runtime(rpcs: list[dict], current_milestone: str) -> int:
    if not os.environ.get("PGHOST"):
        print("[manifest] FAIL — PGHOST not set; cannot query pg_proc "
              "(use --offline to skip runtime check)", file=sys.stderr)
        return 30
    have = pg_functions()
    have_norm = {(n, _norm(s)) for (n, s) in have}
    have_names = {n for (n, _) in have}

    cur_idx = MILESTONE_ORDER.get(current_milestone, -1)
    drift: list[str] = []
    warn: list[str] = []

    for rpc in rpcs:
        name, sig = rpc["name"], rpc["signature"]
        due_idx = MILESTONE_ORDER[rpc["present_by"]]
        due_now = cur_idx >= due_idx
        exact = (name, _norm(sig)) in have_norm
        present = name in have_names
        if exact:
            continue
        # Missing or signature mismatch.
        if not present:
            msg = f"{name} MISSING (expected by {rpc['present_by']})"
        else:
            msg = f"{name} SIGNATURE DRIFT (expected `{sig}`)"
        (drift if due_now else warn).append(msg)

    for w in warn:
        print(f"[manifest] warn (not yet due): {w}")
    for d in drift:
        print(f"[manifest] DRIFT: {d}", file=sys.stderr)

    if drift:
        return 20
    print(f"[manifest] OK — {len(rpcs)} entries; runtime check passed "
          f"(current milestone: {current_milestone}).")
    return 0


# ── Entrypoint ───────────────────────────────────────────────────────────
def die(code: int, msg: str) -> None:
    print(f"[manifest] FAIL — {msg}", file=sys.stderr)
    sys.exit(code)


def main() -> int:
    ap = argparse.ArgumentParser(description="Authorization v2 RPC Manifest Checker")
    ap.add_argument("--manifest", default="scripts/authz/rpc_manifest.yaml")
    ap.add_argument("--milestone", default=os.environ.get("AUTHZ_MILESTONE", "M1"),
                    choices=sorted(VALID_MILESTONES),
                    help="Current implementation milestone (drives 'is due yet?').")
    ap.add_argument("--offline", action="store_true",
                    help="Skip runtime pg_proc check (Phase B).")
    a = ap.parse_args()

    manifest = load_manifest(Path(a.manifest))
    rpcs = validate_schema(manifest)
    print(f"[manifest] OK — schema v{manifest['version']}, {len(rpcs)} entries.")

    if a.offline:
        return 0
    return validate_runtime(rpcs, a.milestone)


if __name__ == "__main__":
    sys.exit(main())
