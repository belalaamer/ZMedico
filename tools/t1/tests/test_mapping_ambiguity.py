#!/usr/bin/env python3
"""Ambiguity and re-application tests for the Production-to-repo mapping."""
import csv
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import migration_match as mm  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def write_repo(root, files):
    mig = os.path.join(root, "supabase", "migrations")
    os.makedirs(mig, exist_ok=True)
    for name, sql in files.items():
        with open(os.path.join(mig, name), "w") as fh:
            fh.write(sql)


class AmbiguityTests(unittest.TestCase):
    def test_two_repo_candidates_with_empty_name_are_unresolved(self):
        with tempfile.TemporaryDirectory() as root:
            write_repo(root, {
                "20260101000000_a.sql": "SELECT 1;\n",
                "20260101000001_b.sql": "SELECT 1;\n",
            })
            production = [{
                "version": "20260101000002",
                "name": "",
                "statements": ["SELECT 1"],
            }]
            mapping, _disp, *_ = mm.classify(production, root)
            row = mapping[0]
            self.assertEqual(row["class"], "B_reversioned")
            self.assertEqual(row["resolution"], "unresolved")
            self.assertEqual(row["repo_file"], "")
            self.assertIn("20260101000000_a.sql", row["repo_candidates"])
            self.assertIn("20260101000001_b.sql", row["repo_candidates"])
            self.assertTrue(row["action"].startswith("STOP"))

    def test_unique_name_resolves_a_content_tie(self):
        with tempfile.TemporaryDirectory() as root:
            write_repo(root, {
                "20260101000000_alpha.sql": "SELECT 1;\n",
                "20260101000001_beta.sql": "SELECT 1;\n",
            })
            production = [{
                "version": "20260101000002",
                "name": "alpha",
                "statements": ["SELECT 1"],
            }]
            mapping, _disp, *_ = mm.classify(production, root)
            row = mapping[0]
            self.assertEqual(row["resolution"], "unique_name")
            self.assertEqual(row["repo_file"], "20260101000000_alpha.sql")
            self.assertIn("20260101000001_beta.sql", row["repo_candidates"])

    def test_identical_production_rows_are_not_deduplicated(self):
        with tempfile.TemporaryDirectory() as root:
            write_repo(root, {
                "20260101000000_grant_a.sql": "REVOKE EXECUTE ON FUNCTION f() FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION f() TO authenticated;\n",
                "20260101000001_grant_b.sql": "REVOKE EXECUTE ON FUNCTION f() FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION f() TO authenticated;\n",
            })
            production = [
                {"version": "20260101000002", "name": "grant_a", "statements": [
                    "REVOKE EXECUTE ON FUNCTION f() FROM PUBLIC;",
                    "GRANT EXECUTE ON FUNCTION f() TO authenticated;",
                ]},
                {"version": "20260101000003", "name": "grant_b", "statements": [
                    "REVOKE EXECUTE ON FUNCTION f() FROM PUBLIC;",
                    "GRANT EXECUTE ON FUNCTION f() TO authenticated;",
                ]},
            ]
            mapping, _disp, *_ = mm.classify(production, root)
            self.assertEqual(len(mapping), 2)
            self.assertEqual([r["production_version"] for r in mapping], ["20260101000002", "20260101000003"])
            later = mapping[1]
            self.assertEqual(later["content_duplicate_of"], "20260101000002")
            self.assertEqual(later["content_duplicate_with"], "20260101000002")
            # No row was dropped by the content hash.
            self.assertEqual(len({r["production_version"] for r in mapping}), 2)


class RealMappingTests(unittest.TestCase):
    def test_coverage_grant_reapplication_is_kept_and_annotated(self):
        path = os.path.join(REPO_ROOT, "docs", "t1", "MIGRATION_MAPPING.csv")
        if not os.path.exists(path):
            self.skipTest("mapping CSV not generated yet")
        with open(path) as fh:
            rows = list(csv.DictReader(fh))
        by_version = {r["production_version"]: r for r in rows}
        first = by_version["20260825215716"]
        second = by_version["20261027174432"]
        self.assertEqual(first["content_duplicate_with"], "20261027174432")
        self.assertEqual(second["content_duplicate_of"], "20260825215716")
        self.assertTrue(second["reapply_reason"])
        # Both rows are still present; content equality did not delete one.
        self.assertEqual(len(rows), 486)

    def test_ambiguous_repo_pair_has_no_primary(self):
        path = os.path.join(REPO_ROOT, "docs", "t1", "MIGRATION_MAPPING.csv")
        if not os.path.exists(path):
            self.skipTest("mapping CSV not generated yet")
        with open(path) as fh:
            rows = list(csv.DictReader(fh))
        row = next(r for r in rows if r["production_version"] == "20260503000554")
        self.assertEqual(row["resolution"], "unresolved")
        self.assertEqual(row["repo_file"], "")
        self.assertIn("20260503000512", row["repo_candidates"])
        self.assertIn("20260503000555", row["repo_candidates"])


if __name__ == "__main__":
    unittest.main()
