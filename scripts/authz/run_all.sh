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

BASE_RPC=""
[[ -f /mnt/documents/golden_rpc_baseline.csv ]] && BASE_RPC="--baseline-rpc /mnt/documents/golden_rpc_baseline.csv"

python scripts/authz/diff_baseline.py \
  --baseline-rls /mnt/documents/golden_authorization_baseline.csv \
  --current-rls  /tmp/authz_current_rls.csv \
  ${BASE_RPC} \
  --current-rpc  /tmp/authz_current_rpcs.csv \
  --intentional  scripts/authz/intentional_changes.txt \
  --report       /tmp/authz_diff_report.md