#!/usr/bin/env python3
"""Unit tests for scripts/authz/check_rpc_manifest.py (Phase A only)."""
import os, subprocess, sys, tempfile, textwrap, unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
CHECKER = REPO / "scripts/authz/check_rpc_manifest.py"

VALID = textwrap.dedent("""
    version: 1
    frozen: true
    rpcs:
      - name: apply_wallet_tx
        signature: "_pid uuid, _amt numeric"
        permission: payments.write
        purpose: test
        present_by: M1
        audit: true
        introduced_in: H3-2
""").strip()


def run(manifest_body: str, *extra: str) -> subprocess.CompletedProcess:
    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as f:
        f.write(manifest_body)
        path = f.name
    try:
        return subprocess.run(
            [sys.executable, str(CHECKER), "--manifest", path, "--offline", *extra],
            capture_output=True, text=True,
        )
    finally:
        os.unlink(path)


class Phase(unittest.TestCase):
    def test_valid_passes(self):
        r = run(VALID)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_missing_file(self):
        r = subprocess.run(
            [sys.executable, str(CHECKER), "--manifest", "/nonexistent.yaml", "--offline"],
            capture_output=True, text=True,
        )
        self.assertEqual(r.returncode, 10)

    def test_malformed_yaml(self):
        r = run("version: 1\nrpcs: [oops")
        self.assertEqual(r.returncode, 10)
        self.assertIn("malformed YAML", r.stderr)

    def test_unsupported_version(self):
        r = run(VALID.replace("version: 1", "version: 99"))
        self.assertEqual(r.returncode, 11)

    def test_not_frozen(self):
        r = run(VALID.replace("frozen: true", "frozen: false"))
        self.assertEqual(r.returncode, 10)
        self.assertIn("frozen", r.stderr)

    def test_duplicate_name(self):
        dup = VALID + "\n" + textwrap.dedent("""\
          - name: apply_wallet_tx
            signature: "_pid uuid, _amt numeric"
            permission: payments.write
            purpose: dup
            present_by: M1
            audit: true
            introduced_in: X
        """)
        r = run(dup)
        self.assertEqual(r.returncode, 10)
        self.assertIn("duplicate", r.stderr)

    def test_invalid_milestone(self):
        r = run(VALID.replace("present_by: M1", "present_by: M9"))
        self.assertEqual(r.returncode, 10)
        self.assertIn("invalid milestone", r.stderr)

    def test_invalid_permission_key(self):
        r = run(VALID.replace("payments.write", "PAYMENTS-WRITE"))
        self.assertEqual(r.returncode, 10)
        self.assertIn("permission", r.stderr)

    def test_missing_required_field(self):
        r = run(VALID.replace("    audit: true\n", ""))
        self.assertEqual(r.returncode, 10)
        self.assertIn("missing required fields", r.stderr)

    def test_invalid_criticality_when_present(self):
        body = VALID.replace("audit: true", "audit: true\n    criticality: nope")
        r = run(body)
        self.assertEqual(r.returncode, 10)
        self.assertIn("criticality", r.stderr)

    def test_project_manifest_validates(self):
        r = subprocess.run(
            [sys.executable, str(CHECKER), "--offline"],
            capture_output=True, text=True, cwd=str(REPO),
        )
        self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == "__main__":
    unittest.main()
