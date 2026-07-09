#!/usr/bin/env bash
# Wave 2.5 · Authorization Regression Harness — orchestrator.
#
# Executes: current RLS analysis → current RPC analysis → diff vs Golden Baseline.
# Exit code propagates from diff_baseline.py (2 = unlabeled changes).
#
# Usage:
#   bash scripts/authz/run_all.sh                       # full suite
#   bash scripts/authz/run_all.sh --table invoices      # single table
#   bash scripts/authz/run_all.sh --role doctor         # single role
#   bash scripts/authz/run_all.sh --cluster Finance     # one policy family
#   bash scripts/authz/run_all.sh --rpc apply_wallet_tx # single RPC
set -euo pipefail
cd "$(dirname "$0")/../.."

RLS_ARGS=(); RPC_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --table|--role|--cluster|--cmd) RLS_ARGS+=("$1" "$2"); shift 2 ;;
    --rpc)                          RPC_ARGS+=("$1" "$2"); shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

python scripts/authz/analyze_rls.py  --out /tmp/authz_current_rls.csv  --summary "${RLS_ARGS[@]}"
python scripts/authz/analyze_rpcs.py --out /tmp/authz_current_rpcs.csv "${RPC_ARGS[@]}"

# R3.5 — Authorization Enforcement Guardrails (advisory by default).
# Fails only in strict mode; scans new-only migrations past the R3.5
# landing cutoff so pre-R3.5 legacy code is not re-relitigated here
# (that debt is tracked by the SECURITY DEFINER compliance report).
GUARDRAILS_STRICT_FLAG=()
[[ "${GUARDRAILS_STRICT:-0}" = "1" ]] && GUARDRAILS_STRICT_FLAG=(--strict)
python scripts/authz/guardrails_frontend.py "${GUARDRAILS_STRICT_FLAG[@]}" || GR_FE_EXIT=$?
python scripts/authz/guardrails_backend.py \
  --since 20260708202908_89763348-3ec9-4b38-92c8-39ea21191db5.sql \
  "${GUARDRAILS_STRICT_FLAG[@]}" || GR_BE_EXIT=$?
if [[ "${GUARDRAILS_STRICT:-0}" = "1" ]]; then
  if [[ "${GR_FE_EXIT:-0}" -ne 0 || "${GR_BE_EXIT:-0}" -ne 0 ]]; then
    echo "[run_all] guardrails failed (strict mode)" >&2
    exit 2
  fi
fi

# RPC-09 — RPC Manifest Checker (Authorization v2).
# Phase A (schema) always runs. Phase B (runtime) is skipped when PGHOST is
# unset. Advisory during M1–M3 (`MANIFEST_STRICT=0`), promote to blocking
# once we reach M4 by exporting MANIFEST_STRICT=1.
#   Exit codes: 0 ok · 10 schema · 11 unsupported version · 20 runtime drift · 30 env
MANIFEST_OFFLINE_FLAG=()
[[ -z "${PGHOST:-}" ]] && MANIFEST_OFFLINE_FLAG=(--offline)
MANIFEST_MILESTONE="${AUTHZ_MILESTONE:-M1}"
set +e
python scripts/authz/check_rpc_manifest.py \
  --manifest scripts/authz/rpc_manifest.yaml \
  --milestone "${MANIFEST_MILESTONE}" \
  "${MANIFEST_OFFLINE_FLAG[@]}"
MANIFEST_EXIT=$?
set -e
case "${MANIFEST_EXIT}" in
  0)  ;;
  10|11)
     echo "[run_all] manifest schema failure (exit ${MANIFEST_EXIT}) — blocking" >&2
     exit "${MANIFEST_EXIT}" ;;
  20)
     if [[ "${MANIFEST_STRICT:-0}" = "1" ]]; then
       echo "[run_all] manifest runtime drift (strict mode) — blocking" >&2
       exit "${MANIFEST_EXIT}"
     else
       echo "[run_all] manifest runtime drift (advisory; set MANIFEST_STRICT=1 to block)" >&2
     fi ;;
  30)
     echo "[run_all] manifest env error (PGHOST) — advisory" >&2 ;;
  *)
     echo "[run_all] manifest unexpected exit ${MANIFEST_EXIT}" >&2
     exit "${MANIFEST_EXIT}" ;;
esac

# Sprint S2 — SECURITY DEFINER Standard v1 compliance check.
# Advisory by default (does not fail the pipeline); pass COMPLIANCE_STRICT=1
# to promote FAIL verdicts to non-zero exit.
COMPLIANCE_STRICT_FLAG=()
[[ "${COMPLIANCE_STRICT:-0}" = "1" ]] && COMPLIANCE_STRICT_FLAG=(--strict)
python scripts/authz/compliance_definer.py \
  --csv    /tmp/authz_compliance.csv \
  --report /tmp/authz_compliance.md \
  "${COMPLIANCE_STRICT_FLAG[@]}" || COMPLIANCE_EXIT=$?
if [[ "${COMPLIANCE_EXIT:-0}" -ne 0 && "${COMPLIANCE_STRICT:-0}" = "1" ]]; then
  echo "[run_all] compliance check reported FAIL verdicts (strict mode)" >&2
  exit "${COMPLIANCE_EXIT}"
fi

BASE_RPC=""
[[ -f /mnt/documents/golden_rpc_baseline.csv ]] && BASE_RPC="--baseline-rpc /mnt/documents/golden_rpc_baseline.csv"

python scripts/authz/diff_baseline.py \
  --baseline-rls /mnt/documents/golden_authorization_baseline.csv \
  --current-rls  /tmp/authz_current_rls.csv \
  ${BASE_RPC} \
  --current-rpc  /tmp/authz_current_rpcs.csv \
  --intentional  scripts/authz/intentional_changes.txt \
  --report       /tmp/authz_diff_report.md