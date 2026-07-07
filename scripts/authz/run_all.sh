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