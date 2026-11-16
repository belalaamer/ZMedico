#!/usr/bin/env python3
"""Fail-closed history tests: every row once, in order, with provenance."""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import history_preflight as hp  # noqa: E402
import migration_match as mm  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha(path: str) -> str:
    with open(path, "rb") as fh:
        return sha(fh.read())


def read_json(path: str):
    with open(path) as fh:
        return json.load(fh)


def read_jsonl(path: str):
    with open(path) as fh:
        return [json.loads(line) for line in fh if line.strip()]


def write(path: str, text: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        fh.write(text)


def repo_manifest(root: str, names):
    records = []
    for name in names:
        path = os.path.join(root, "supabase", "migrations", name)
        records.append({
            "version": name[:14],
            "path": os.path.relpath(path, root),
            "sha256": file_sha(path),
            "bytes": os.path.getsize(path),
        })
    records.sort(key=lambda r: r["version"])
    path = os.path.join(root, "repo-history.json")
    write(path, json.dumps({"history": "repo", "record_count": len(records), "files": records}))
    return path


def prod_row(root, version, name, cls, resolution, source_type, source_path, sql, **extra):
    source = {"type": source_type, "path": source_path, "sha256": ""}
    if source_path:
        source["sha256"] = file_sha(os.path.join(root, source_path))
    row = {
        "ordinal": 0,
        "version": version,
        "name": name,
        "class": cls,
        "resolution": resolution,
        "source": source,
        "production_statements_sha256": sha(sql.strip().encode()),
        "production_token_sha256": mm.statement_hash(sql),
    }
    row.update(extra)
    return row


def write_prod_manifest(root, rows):
    for index, row in enumerate(rows, 1):
        row["ordinal"] = index
    path = os.path.join(root, "production-history.jsonl")
    with open(path, "w") as fh:
        for row in rows:
            fh.write(json.dumps(row, sort_keys=True) + "\n")
    return path


class RepoHistoryTests(unittest.TestCase):
    def test_every_repository_file_is_planned_exactly_once(self):
        with tempfile.TemporaryDirectory() as root:
            names = ["20260101000000_a.sql", "20260101000001_b.sql", "20260101000002_c.sql"]
            for i, name in enumerate(names, 1):
                write(os.path.join(root, "supabase", "migrations", name), f"SELECT {i};\n")
            manifest = repo_manifest(root, names)
            v = hp.Validation()
            plan = hp.check_repo(manifest, root, 3, v)
            self.assertTrue(v.ok(), v.errors)
            self.assertEqual(len(plan), 3)
            self.assertEqual([p["version"] for p in plan], sorted(n[:14] for n in names))
            self.assertEqual(len({p["path"] for p in plan}), 3)

    def test_duplicate_content_without_annotation_stops(self):
        with tempfile.TemporaryDirectory() as root:
            names = ["20260101000000_a.sql", "20260101000001_b.sql"]
            for name in names:
                write(os.path.join(root, "supabase", "migrations", name), "SELECT 1;\n")
            manifest = repo_manifest(root, names)
            v = hp.Validation()
            plan = hp.check_repo(manifest, root, 2, v)
            self.assertFalse(v.ok())
            self.assertEqual(len(plan), 2)  # still records both; no auto-selection
            joined = "\n".join(v.errors)
            self.assertIn("duplicate token content", joined)
            self.assertIn("will not pick one", joined)
            self.assertIn("20260101000000", joined)
            self.assertIn("20260101000001", joined)

    def test_intentional_reapply_keeps_both_files(self):
        with tempfile.TemporaryDirectory() as root:
            names = ["20260101000000_grant_a.sql", "20260101000001_grant_b.sql"]
            for name in names:
                write(os.path.join(root, "supabase", "migrations", name), "GRANT EXECUTE ON FUNCTION f() TO authenticated;\n")
            write(
                os.path.join(root, "tools", "t1", "history", "repo-annotations.json"),
                json.dumps({"duplicate_groups": [{
                    "versions": ["20260101000000", "20260101000001"],
                    "status": "intentional_reapply",
                    "reason": "same grant applied twice deliberately",
                }]}),
            )
            manifest = repo_manifest(root, names)
            v = hp.Validation()
            plan = hp.check_repo(manifest, root, 2, v)
            self.assertTrue(v.ok(), v.errors)
            self.assertEqual(len(plan), 2)
            self.assertEqual(len({p["version"] for p in plan}), 2)

    def test_duplicate_version_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            names = ["20260101000000_a.sql", "20260101000000_b.sql"]
            for name in names:
                write(os.path.join(root, "supabase", "migrations", name), "SELECT 1;\n")
            manifest = repo_manifest(root, names)
            v = hp.Validation()
            hp.check_repo(manifest, root, 2, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("duplicate version" in e for e in v.errors))

    def test_missing_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            names = ["20260101000000_a.sql"]
            write(os.path.join(root, "supabase", "migrations", names[0]), "SELECT 1;\n")
            manifest = repo_manifest(root, names)
            os.unlink(os.path.join(root, "supabase", "migrations", names[0]))
            v = hp.Validation()
            hp.check_repo(manifest, root, 1, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("source missing" in e for e in v.errors))

    def test_hash_drift_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            names = ["20260101000000_a.sql"]
            write(os.path.join(root, "supabase", "migrations", names[0]), "SELECT 1;\n")
            manifest = repo_manifest(root, names)
            data = read_json(manifest)
            data["files"][0]["sha256"] = "0" * 64
            write(manifest, json.dumps(data))
            v = hp.Validation()
            hp.check_repo(manifest, root, 1, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("sha256 drift" in e for e in v.errors))

    def test_unlisted_repository_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            names = ["20260101000000_a.sql"]
            write(os.path.join(root, "supabase", "migrations", names[0]), "SELECT 1;\n")
            write(os.path.join(root, "supabase", "migrations", "20260101000001_extra.sql"), "SELECT 2;\n")
            manifest = repo_manifest(root, names)
            v = hp.Validation()
            hp.check_repo(manifest, root, 2, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("repository file missing from manifest" in e for e in v.errors))


    def test_real_repo_plans_all_436_files_once_under_a_temporary_annotation(self):
        """A human decision that both patient-code files apply plans 436/436.

        This temp annotation proves the harness does not drop or duplicate a
        file. It does not resolve the real ambiguity in the committed manifest.
        """
        manifest = os.path.join(REPO_ROOT, "tools/t1/history/repo-history.json")
        with tempfile.TemporaryDirectory() as root:
            os.makedirs(os.path.join(root, "supabase"), exist_ok=True)
            os.symlink(
                os.path.join(REPO_ROOT, "supabase", "migrations"),
                os.path.join(root, "supabase", "migrations"),
            )
            write(
                os.path.join(root, "tools", "t1", "history", "repo-annotations.json"),
                json.dumps({"duplicate_groups": [
                    {
                        "versions": ["20260503000512", "20260503000555"],
                        "status": "intentional_reapply",
                        "reason": "test-only decision: prove both files are planned once",
                    },
                    {
                        "versions": ["20260826030000", "20261025090000"],
                        "status": "intentional_reapply",
                        "reason": "real deliberate coverage-grant re-application",
                    },
                ]}),
            )
            v = hp.Validation()
            plan = hp.check_repo(manifest, root, 436, v)
            self.assertTrue(v.ok(), v.errors)
            self.assertEqual(len(plan), 436)
            self.assertEqual(len({p["version"] for p in plan}), 436)
            self.assertEqual(len({p["path"] for p in plan}), 436)


class ProductionHistoryTests(unittest.TestCase):
    def build_three_sources(self, root):
        write(os.path.join(root, "supabase", "migrations", "20260101000000_a.sql"), "SELECT 1;\n")
        write(os.path.join(root, "supabase", "migrations.recovered", "20260101000001_b.sql"),
              "-- recovered header\n\nSELECT 2;\n")
        write(os.path.join(root, "tools", "t1", "history", "production", "sql", "20260101000002.sql"),
              "SELECT 3;\n")
        rows = [
            prod_row(root, "20260101000000", "a", "A_exact", "unique_name", "repo",
                     "supabase/migrations/20260101000000_a.sql", "SELECT 1;"),
            prod_row(root, "20260101000001", "b", "D_no_exact_match", "recovered_exact", "recovered",
                     "supabase/migrations.recovered/20260101000001_b.sql", "SELECT 2;"),
            prod_row(root, "20260101000002", "c", "C_same_version_conflict", "production_exact", "production",
                     "tools/t1/history/production/sql/20260101000002.sql", "SELECT 3;"),
        ]
        return write_prod_manifest(root, rows)

    def test_all_rows_are_planned_once_in_order(self):
        with tempfile.TemporaryDirectory() as root:
            manifest = self.build_three_sources(root)
            v = hp.Validation()
            plan = hp.check_production(manifest, root, 3, v)
            self.assertTrue(v.ok(), v.errors)
            self.assertEqual([p["ordinal"] for p in plan], [1, 2, 3])
            self.assertEqual([p["version"] for p in plan], ["20260101000000", "20260101000001", "20260101000002"])
            self.assertEqual(len({p["version"] for p in plan}), 3)

    def test_real_production_plans_all_486_rows_in_order_with_a_temporary_source(self):
        """A test-only source for row 554 proves all 486 rows are kept in order.

        It does not choose the real source for the ambiguous row.
        """
        source = os.path.join(REPO_ROOT, "tools/t1/history/production-history.jsonl")
        rows = read_jsonl(source)
        target = next(r for r in rows if r["version"] == "20260503000554")
        repo_path = "supabase/migrations/20260503000512_reset_patient_code_to_active_max.sql"
        with open(os.path.join(REPO_ROOT, repo_path), errors="ignore") as fh:
            repo_text = fh.read()
        target["resolution"] = "single_candidate"
        target["source"] = {
            "type": "repo",
            "path": repo_path,
            "sha256": file_sha(os.path.join(REPO_ROOT, repo_path)),
            "token_sha256": mm.statement_hash(repo_text),
        }
        with tempfile.TemporaryDirectory() as root:
            temp_manifest = os.path.join(root, "production-history.jsonl")
            with open(temp_manifest, "w") as fh:
                for row in rows:
                    fh.write(json.dumps(row, sort_keys=True) + "\n")
            v = hp.Validation()
            plan = hp.check_production(temp_manifest, REPO_ROOT, 486, v)
            self.assertTrue(v.ok(), v.errors)
            self.assertEqual(len(plan), 486)
            self.assertEqual([p["ordinal"] for p in plan], list(range(1, 487)))
            self.assertEqual([p["version"] for p in plan], [r["version"] for r in rows])
            self.assertEqual(len({p["version"] for p in plan}), 486)

    def test_out_of_order_rows_are_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            manifest = self.build_three_sources(root)
            rows = read_jsonl(manifest)
            rows[0], rows[2] = rows[2], rows[0]
            manifest = write_prod_manifest(root, rows)
            v = hp.Validation()
            hp.check_production(manifest, root, 3, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("order is not strictly increasing" in e for e in v.errors))

    def test_duplicate_production_version_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            manifest = self.build_three_sources(root)
            rows = read_jsonl(manifest)
            rows[1]["version"] = rows[0]["version"]
            manifest = write_prod_manifest(root, rows)
            v = hp.Validation()
            hp.check_production(manifest, root, 3, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("duplicate production version" in e for e in v.errors))

    def test_unresolved_row_stops_the_whole_manifest(self):
        with tempfile.TemporaryDirectory() as root:
            manifest = self.build_three_sources(root)
            rows = read_jsonl(manifest)
            rows[1]["resolution"] = "unresolved"
            rows[1]["source"] = {"type": "unresolved", "path": "", "sha256": ""}
            manifest = write_prod_manifest(root, rows)
            v = hp.Validation()
            hp.check_production(manifest, root, 3, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("unresolved mapping" in e for e in v.errors))

    def test_same_content_needs_a_reapply_reason(self):
        with tempfile.TemporaryDirectory() as root:
            write(os.path.join(root, "supabase", "migrations", "20260101000000_grant_a.sql"),
                  "GRANT EXECUTE ON FUNCTION f() TO authenticated;\n")
            write(os.path.join(root, "supabase", "migrations", "20260101000001_grant_b.sql"),
                  "GRANT EXECUTE ON FUNCTION f() TO authenticated;\n")
            sql = "GRANT EXECUTE ON FUNCTION f() TO authenticated;"
            rows = [
                prod_row(root, "20260101000002", "grant_a", "B_reversioned", "unique_name", "repo",
                         "supabase/migrations/20260101000000_grant_a.sql", sql),
                prod_row(root, "20260101000003", "grant_b", "B_reversioned", "unique_name", "repo",
                         "supabase/migrations/20260101000001_grant_b.sql", sql),
            ]
            manifest = write_prod_manifest(root, rows)
            v = hp.Validation()
            hp.check_production(manifest, root, 2, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("no content_duplicate_of annotation" in e for e in v.errors))
            self.assertTrue(any("needs an explicit reapply_reason" in e for e in v.errors))

            rows[1]["content_duplicate_of"] = rows[0]["version"]
            rows[1]["reapply_reason"] = "deliberate second application"
            manifest = write_prod_manifest(root, rows)
            v = hp.Validation()
            plan = hp.check_production(manifest, root, 2, v)
            self.assertTrue(v.ok(), v.errors)
            self.assertEqual(len(plan), 2)
            self.assertEqual(plan[1]["reapply_of"], rows[0]["version"])

    def test_missing_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            manifest = self.build_three_sources(root)
            rows = read_jsonl(manifest)
            rows[0]["source"]["path"] = "supabase/migrations/does_not_exist.sql"
            manifest = write_prod_manifest(root, rows)
            v = hp.Validation()
            hp.check_production(manifest, root, 3, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("source missing" in e for e in v.errors))

    def test_source_hash_drift_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            manifest = self.build_three_sources(root)
            rows = read_jsonl(manifest)
            rows[0]["source"]["sha256"] = "0" * 64
            manifest = write_prod_manifest(root, rows)
            v = hp.Validation()
            hp.check_production(manifest, root, 3, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("sha256 drift" in e for e in v.errors))

    def test_export_cross_check_passes_when_all_rows_match(self):
        with tempfile.TemporaryDirectory() as root:
            manifest = self.build_three_sources(root)
            rows = read_jsonl(manifest)
            export = [
                {"version": "20260101000000", "name": "a", "statements": ["SELECT 1;"]},
                {"version": "20260101000001", "name": "b", "statements": ["SELECT 2;"]},
                {"version": "20260101000002", "name": "c", "statements": ["SELECT 3;"]},
            ]
            v = hp.Validation()
            hp.check_production_against_export(rows, export, v)
            self.assertTrue(v.ok(), v.errors)

    def test_export_cross_check_rejects_a_dropped_row(self):
        with tempfile.TemporaryDirectory() as root:
            manifest = self.build_three_sources(root)
            rows = read_jsonl(manifest)
            export = [
                {"version": "20260101000000", "name": "a", "statements": ["SELECT 1;"]},
                {"version": "20260101000001", "name": "b", "statements": ["SELECT 2;"]},
                {"version": "20260101000002", "name": "c", "statements": ["SELECT 3;"]},
                {"version": "20260101000003", "name": "d", "statements": ["SELECT 4;"]},
            ]
            v = hp.Validation()
            hp.check_production_against_export(rows, export, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("Production export but missing from the manifest" in e for e in v.errors))

    def test_export_cross_check_rejects_changed_sql(self):
        with tempfile.TemporaryDirectory() as root:
            manifest = self.build_three_sources(root)
            rows = read_jsonl(manifest)
            export = [
                {"version": "20260101000000", "name": "a", "statements": ["SELECT 1;"]},
                {"version": "20260101000001", "name": "b", "statements": ["SELECT 2;"]},
                {"version": "20260101000002", "name": "c", "statements": ["SELECT 9;"]},
            ]
            v = hp.Validation()
            hp.check_production_against_export(rows, export, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("raw statement hash does not match" in e for e in v.errors))

    def test_cross_history_source_path_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            manifest = self.build_three_sources(root)
            rows = read_jsonl(manifest)
            # A Production-history row must not silently read a repository file.
            rows[2]["source"]["type"] = "production"
            rows[2]["source"]["path"] = "supabase/migrations/20260101000000_a.sql"
            rows[2]["source"]["sha256"] = file_sha(os.path.join(root, rows[2]["source"]["path"]))
            manifest = write_prod_manifest(root, rows)
            v = hp.Validation()
            hp.check_production(manifest, root, 3, v)
            self.assertFalse(v.ok())
            self.assertTrue(any("outside the production-history directory" in e for e in v.errors))


class RealHistoryTests(unittest.TestCase):
    def test_real_repo_preflight_stops_on_the_unresolved_pair(self):
        result = subprocess.run(
            [sys.executable, "tools/t1/history_preflight.py", "--history", "repo", "--repo", ".", "--expect", "436"],
            cwd=REPO_ROOT, text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("20260503000512", result.stderr)
        self.assertIn("20260503000555", result.stderr)
        self.assertIn("A human must choose", result.stderr)

    def test_real_production_preflight_stops_on_the_unresolved_row(self):
        result = subprocess.run(
            [sys.executable, "tools/t1/history_preflight.py", "--history", "production", "--repo", ".", "--expect", "486"],
            cwd=REPO_ROOT, text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("20260503000554", result.stderr)
        self.assertIn("unresolved mapping", result.stderr)
        self.assertIn("20260503000512", result.stderr)
        self.assertIn("20260503000555", result.stderr)

    def test_real_manifests_have_all_rows_once(self):
        repo = read_json(os.path.join(REPO_ROOT, "tools/t1/history/repo-history.json"))
        self.assertEqual(len(repo["files"]), 436)
        self.assertEqual(len({r["version"] for r in repo["files"]}), 436)
        prod = read_jsonl(os.path.join(REPO_ROOT, "tools/t1/history/production-history.jsonl"))
        self.assertEqual(len(prod), 486)
        self.assertEqual([r["ordinal"] for r in prod], list(range(1, 487)))
        self.assertEqual(len({r["version"] for r in prod}), 486)
        self.assertEqual([r["version"] for r in prod], sorted(r["version"] for r in prod))
        self.assertEqual(sum(1 for r in prod if r["resolution"] == "unresolved"), 1)


if __name__ == "__main__":
    unittest.main()
