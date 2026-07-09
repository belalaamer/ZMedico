#!/usr/bin/env python3
"""Unit tests for R3.5 authorization guardrail checkers."""
import os, subprocess, sys, tempfile, textwrap, unittest
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
FE   = REPO / "scripts/authz/guardrails_frontend.py"
BE   = REPO / "scripts/authz/guardrails_backend.py"


def _load(path):
    spec = spec_from_file_location(path.stem, path)
    mod = module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore
    return mod


def _write_sql(body: str) -> Path:
    tmp = tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False)
    tmp.write(body); tmp.close()
    return Path(tmp.name)


class Frontend(unittest.TestCase):
    def test_baseline_clean(self):
        r = subprocess.run(
            [sys.executable, str(FE), "--strict"],
            capture_output=True, text=True,
        )
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


class BackendMigrationLint(unittest.TestCase):
    def setUp(self):
        self.mod = _load(BE)

    def test_flags_missing_gate_and_actor_param(self):
        path = _write_sql(textwrap.dedent("""
            CREATE OR REPLACE FUNCTION public.bad_rpc(_by uuid)
            RETURNS void
            LANGUAGE plpgsql
            SECURITY DEFINER
            AS $$
            BEGIN
              PERFORM has_role(_by, 'admin');
            END;
            $$;
        """))
        try:
            findings = self.mod.scan_migration(path)
            codes = {c for _, c, _ in findings}
            self.assertTrue(any(c.startswith("definer_has_role")          for c in codes))
            self.assertTrue(any(c.startswith("definer_no_has_permission") for c in codes))
            self.assertTrue(any(c.startswith("definer_actor_param")       for c in codes))
            self.assertTrue(any(c.startswith("definer_no_search_path")    for c in codes))
        finally:
            os.unlink(path)

    def test_canonical_definer_is_clean(self):
        path = _write_sql(textwrap.dedent("""
            CREATE OR REPLACE FUNCTION public.good_rpc(_amount numeric)
            RETURNS void
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path TO 'public'
            AS $$
            DECLARE _uid uuid := auth.uid();
            BEGIN
              IF NOT has_permission(_uid, 'demo.write') THEN
                RAISE EXCEPTION 'denied';
              END IF;
            END;
            $$;
        """))
        try:
            self.assertEqual(self.mod.scan_migration(path), [])
        finally:
            os.unlink(path)

    def test_legacy_marker_skips_file(self):
        path = _write_sql(textwrap.dedent("""
            -- authz-guardrails: legacy-ok
            CREATE OR REPLACE FUNCTION public.bad_rpc(_by uuid)
            RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
            BEGIN PERFORM has_role(_by, 'admin'); END; $$;
        """))
        try:
            self.assertEqual(self.mod.scan_migration(path), [])
        finally:
            os.unlink(path)


if __name__ == "__main__":
    unittest.main()
