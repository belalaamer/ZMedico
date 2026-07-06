#!/usr/bin/env python3
"""
One-time helper: derive the RPC baseline CSV from the current DB and
freeze it beside the RLS Golden Baseline. Run this once immediately
after the harness lands, then commit the CSV. Future runs use it as the
comparison target — do NOT re-run before a migration.
"""
import subprocess, sys
sys.exit(subprocess.call([
    sys.executable, "scripts/authz/analyze_rpcs.py",
    "--out", "/mnt/documents/golden_rpc_baseline.csv",
]))