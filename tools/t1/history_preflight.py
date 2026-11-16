#!/usr/bin/env python3
"""Fail-closed preflight for the two T1 migration histories.

This script does not touch a database. It validates a manifest, checks every
source hash, and writes an exact apply plan. It refuses to continue when a row
is ambiguous, a source is missing, a version repeats, a file repeats, or two
different rows would be silently deduplicated by content.

Histories:
  repo        supabase/migrations/*.sql only, one manifest record per file.
  production  one manifest record per Production schema_migrations row, in
              Production version order.

Exit status: 0 if the manifest is buildable, 2 if any check fails.
"""
from __future__ import annotations

import argparse
import collections
import glob
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import migration_match as mm  # noqa: E402


DEFAULT_MANIFESTS = {
    "repo": "tools/t1/history/repo-history.json",
    "production": "tools/t1/history/production-history.jsonl",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def sha256_file(path: str) -> str:
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def bytes_file(path: str) -> int:
    return os.path.getsize(path)


def read_json(path: str):
    with open(path) as fh:
        return json.load(fh)


def read_jsonl(path: str):
    out = []
    with open(path) as fh:
        for line_no, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"FATAL: {path}:{line_no}: invalid JSON: {exc}")
    return out


def recovered_body(text: str) -> str:
    return re.sub(r"^(?:--[^\n]*\n)+", "", text)


def within(path: str, root: str) -> bool:
    path = os.path.realpath(path)
    root = os.path.realpath(root)
    return path == root or path.startswith(root + os.sep)


class Validation:
    def __init__(self):
        self.errors: list[str] = []

    def fail(self, message: str):
        self.errors.append(message)

    def require(self, condition: bool, message: str):
        if not condition:
            self.fail(message)

    def ok(self) -> bool:
        return not self.errors


def load_repo_annotations(repo_root: str):
    path = os.path.join(repo_root, "tools", "t1", "history", "repo-annotations.json")
    if not os.path.exists(path):
        return {}
    data = read_json(path)
    out = {}
    for group in data.get("duplicate_groups", []):
        key = tuple(sorted(group.get("versions", [])))
        out[key] = group
    return out


def check_repo(manifest_path: str, repo_root: str, expect: int | None, v: Validation):
    manifest = read_json(manifest_path)
    records = manifest.get("files", [])
    v.require(manifest.get("history") == "repo", "manifest history must be 'repo'")
    v.require(len(records) > 0, "repo manifest has no files")
    if expect is not None:
        v.require(len(records) == expect, f"repo manifest has {len(records)} records, expected {expect}")
    if manifest.get("record_count") is not None:
        v.require(manifest["record_count"] == len(records),
                  f"record_count={manifest['record_count']} but files={len(records)}")

    repo_migrations = os.path.join(repo_root, "supabase", "migrations")
    seen_versions = {}
    seen_names = {}
    token_groups = collections.defaultdict(list)
    plan = []

    for index, rec in enumerate(records, 1):
        version = str(rec.get("version", ""))
        path = str(rec.get("path", ""))
        if not re.fullmatch(r"\d{14}", version):
            v.fail(f"record {index}: version is not 14 digits: {version!r}")
        if version in seen_versions:
            v.fail(f"duplicate version {version}: {seen_versions[version]} and {path}")
        seen_versions[version] = path
        if not path.endswith(".sql"):
            v.fail(f"{version}: path is not a .sql file: {path}")
        if not os.path.exists(os.path.join(repo_root, path)):
            v.fail(f"{version}: source missing: {path}")
            continue
        if not within(os.path.join(repo_root, path), repo_migrations):
            v.fail(f"{version}: repo source is outside supabase/migrations: {path}")
        name = os.path.basename(path)
        if name in seen_names:
            v.fail(f"duplicate filename {name}: {seen_names[name]} and {path}")
        seen_names[name] = path
        if not name.startswith(version + "_"):
            v.fail(f"{version}: filename does not start with its version: {name}")
        with open(os.path.join(repo_root, path), errors="ignore") as fh:
            raw = fh.read()
        actual_sha = sha256_file(os.path.join(repo_root, path))
        actual_bytes = bytes_file(os.path.join(repo_root, path))
        if rec.get("sha256") and rec["sha256"] != actual_sha:
            v.fail(f"{version}: sha256 drift: manifest={rec['sha256']} file={actual_sha}")
        if rec.get("bytes") is not None and rec["bytes"] != actual_bytes:
            v.fail(f"{version}: byte-size drift: manifest={rec['bytes']} file={actual_bytes}")
        token = mm.statement_hash(raw)
        token_groups[token].append(rec)
        plan.append({
            "ordinal": index,
            "version": version,
            "path": path,
            "sha256": actual_sha,
            "token_sha256": token,
        })

    # Versions must be strictly increasing in the manifest, not merely unique.
    versions = [r.get("version", "") for r in records]
    for previous, current in zip(versions, versions[1:]):
        if previous >= current:
            v.fail(f"manifest order is not strictly increasing: {previous} then {current}")

    # The manifest must cover the active directory exactly, in both directions.
    actual_sql = {
        os.path.relpath(p, repo_root).replace(os.sep, "/")
        for p in glob.glob(os.path.join(repo_migrations, "*.sql"))
    }
    manifest_paths = {
        os.path.normpath(str(r.get("path", ""))).replace(os.sep, "/")
        for r in records
    }
    for path in sorted(actual_sql - manifest_paths):
        v.fail(f"repository file missing from manifest: {path}")
    for path in sorted(manifest_paths - actual_sql):
        v.fail(f"manifest record has no repository file: {path}")

    annotations = load_repo_annotations(repo_root)
    for token, group in token_groups.items():
        if len(group) <= 1:
            continue
        key = tuple(sorted(r["version"] for r in group))
        annotation = annotations.get(key)
        detail = ", ".join(f"{r['version']}={r['path']}" for r in group)
        if not annotation:
            v.fail(
                "duplicate token content in repo history without an annotation: "
                f"{detail}. Add a resolved entry to tools/t1/history/repo-annotations.json "
                "or choose a canonical file. The preflight will not pick one."
            )
            continue
        status = annotation.get("status")
        if status == "unresolved":
            reason = str(annotation.get("reason", "not stated")).rstrip(".")
            v.fail(
                "unresolved duplicate token content in repo history: "
                f"{detail}. Reason: {reason}. "
                "A human must choose before the build can run."
            )
            continue
        if status == "intentional_reapply":
            if not annotation.get("reason"):
                v.fail(f"intentional re-application has no reason: {detail}")
            # Both files are real history. Do not deduplicate them.
            continue
        if status != "resolved":
            v.fail(f"unknown duplicate annotation status {status!r} for {detail}")
            continue
        canonical = annotation.get("canonical")
        if not canonical or canonical not in key:
            v.fail(f"duplicate annotation has no canonical member from {key}: {annotation}")
            continue
        for rec in group:
            if rec["version"] == canonical:
                continue
            if rec.get("duplicate_of") != canonical or not rec.get("duplicate_reason"):
                v.fail(
                    f"{rec['version']}: duplicate of {canonical} needs duplicate_of and "
                    "duplicate_reason in the manifest; content was not deduplicated automatically"
                )

    return plan


def check_production(manifest_path: str, repo_root: str, expect: int | None, v: Validation):
    rows = read_jsonl(manifest_path)
    if expect is not None:
        v.require(len(rows) == expect, f"production manifest has {len(rows)} rows, expected {expect}")
    v.require(len(rows) > 0, "production manifest is empty")

    seen_versions = {}
    token_groups = collections.defaultdict(list)
    plan = []

    for index, row in enumerate(rows, 1):
        version = str(row.get("version", ""))
        ordinal = row.get("ordinal", index)
        if ordinal != index:
            v.fail(f"row {index}: ordinal is {ordinal}, expected {index}")
        if not re.fullmatch(r"\d{14}", version):
            v.fail(f"row {index}: version is not 14 digits: {version!r}")
        if version in seen_versions:
            v.fail(f"duplicate production version {version}: row {seen_versions[version]} and row {index}")
        seen_versions[version] = index

        cls = row.get("class", "")
        resolution = row.get("resolution", "")
        source = row.get("source") or {}
        source_type = source.get("type", "")
        source_path = source.get("path", "")
        prod_token = row.get("production_token_sha256", "")
        prod_raw = row.get("production_statements_sha256", "")
        if prod_token:
            token_groups[prod_token].append(row)

        if resolution == "unresolved" or source_type == "unresolved":
            candidates = row.get("candidates") or []
            candidate_text = f" Candidates: {', '.join(candidates)}." if candidates else ""
            v.fail(
                f"{version}: unresolved mapping; source is not chosen. "
                f"{row.get('ambiguity', 'no reason recorded')}.{candidate_text}"
            )
            continue
        if not source_path:
            v.fail(f"{version}: no SQL source path")
            continue
        absolute = os.path.join(repo_root, source_path)
        if not os.path.exists(absolute):
            v.fail(f"{version}: source missing: {source_path}")
            continue
        actual_sha = sha256_file(absolute)
        if source.get("sha256") and source["sha256"] != actual_sha:
            v.fail(f"{version}: source sha256 drift: manifest={source['sha256']} file={actual_sha}")

        if source_type == "repo":
            if not within(absolute, os.path.join(repo_root, "supabase", "migrations")):
                v.fail(f"{version}: repo source is outside supabase/migrations: {source_path}")
            with open(absolute, errors="ignore") as fh:
                text = fh.read()
            actual_token = mm.statement_hash(text)
            if cls in ("A_exact", "B_reversioned") and prod_token and actual_token != prod_token:
                v.fail(f"{version}: repo source token hash does not match Production token hash")
            if cls == "A2_registration_note":
                note = row.get("note") or source.get("note") or {}
                if not note.get("verified"):
                    v.fail(f"{version}: registration note is not verified")
                if note.get("text") is not None and note.get("text_sha256"):
                    if sha256_text(note["text"]) != note["text_sha256"]:
                        v.fail(f"{version}: registration note text hash does not match note.text")
                cited_md5 = note.get("cited_md5", "")
                cited_bytes = note.get("cited_bytes")
                with open(absolute, "rb") as fh:
                    actual_md5 = hashlib.md5(fh.read()).hexdigest()
                if cited_md5 and cited_md5 != actual_md5:
                    v.fail(f"{version}: registration note md5 does not match {source_path}")
                if cited_bytes is not None and cited_bytes != bytes_file(absolute):
                    v.fail(f"{version}: registration note byte count does not match {source_path}")
        elif source_type == "recovered":
            if not within(absolute, os.path.join(repo_root, "supabase", "migrations.recovered")):
                v.fail(f"{version}: recovered source is outside supabase/migrations.recovered: {source_path}")
            with open(absolute, errors="ignore") as fh:
                text = fh.read()
            body = recovered_body(text).strip("\n")
            if prod_raw and sha256_bytes(body.encode()) != prod_raw:
                v.fail(f"{version}: recovered body raw hash does not match Production statements")
            if prod_token and mm.statement_hash(body) != prod_token:
                v.fail(f"{version}: recovered body token hash does not match Production token hash")
        elif source_type == "production":
            if not within(absolute, os.path.join(repo_root, "tools", "t1", "history", "production", "sql")):
                v.fail(f"{version}: production source is outside the production-history directory: {source_path}")
            with open(absolute, errors="ignore") as fh:
                text = fh.read()
            if prod_raw and sha256_bytes(text.strip("\n").encode()) != prod_raw:
                v.fail(f"{version}: exact Production source raw hash does not match Production statements")
            if prod_token and mm.statement_hash(text) != prod_token:
                v.fail(f"{version}: exact Production source token hash does not match Production token hash")
        else:
            v.fail(f"{version}: unknown source type {source_type!r}")

        plan.append({
            "ordinal": index,
            "version": version,
            "name": row.get("name", ""),
            "class": cls,
            "resolution": resolution,
            "source_type": source_type,
            "source_path": source_path,
            "source_sha256": actual_sha,
            "production_statements_sha256": prod_raw,
            "reapply_of": row.get("content_duplicate_of", ""),
            "reapply_reason": row.get("reapply_reason", ""),
        })

    versions = [str(r.get("version", "")) for r in rows]
    for previous, current in zip(versions, versions[1:]):
        if previous >= current:
            v.fail(f"production order is not strictly increasing: {previous} then {current}")

    for token, group in token_groups.items():
        if len(group) <= 1:
            continue
        ordered = sorted(group, key=lambda r: r["version"])
        for rec in ordered[1:]:
            if not rec.get("content_duplicate_of"):
                v.fail(
                    f"{rec['version']}: same Production SQL as {ordered[0]['version']} "
                    "but no content_duplicate_of annotation; the preflight will not deduplicate it"
                )
            if not rec.get("reapply_reason"):
                v.fail(
                    f"{rec['version']}: re-application of {rec.get('content_duplicate_of')} "
                    "needs an explicit reapply_reason; it is not a duplicate to drop"
                )

    return plan


def check_production_against_export(rows: list[dict], production: list[dict], v: Validation):
    """Cross-check the manifest against the read-only Production query export."""
    export = sorted(production, key=lambda r: str(r.get("version", "")))
    if len(rows) != len(export):
        v.fail(f"manifest has {len(rows)} rows but the Production export has {len(export)}")
    manifest_versions = [str(r.get("version", "")) for r in rows]
    export_versions = [str(r.get("version", "")) for r in export]
    if manifest_versions != export_versions:
        for index, (a, b) in enumerate(zip(manifest_versions, export_versions), 1):
            if a != b:
                v.fail(f"Production order diverges at row {index}: manifest={a} export={b}")
                break
        else:
            v.fail("Production version sets differ at the end of the manifest")
    by_version = {str(r.get("version", "")): r for r in rows}
    for source in export:
        version = str(source.get("version", ""))
        row = by_version.get(version)
        if not row:
            v.fail(f"{version}: present in the Production export but missing from the manifest")
            continue
        statements = source.get("statements") or []
        sql = "\n".join(statements)
        raw = sha256_text(sql.strip("\n"))
        token = mm.statement_hash(sql, statements)
        if row.get("production_statements_sha256") != raw:
            v.fail(f"{version}: manifest raw statement hash does not match the Production export")
        if row.get("production_token_sha256") != token:
            v.fail(f"{version}: manifest token hash does not match the Production export")
        if (row.get("name") or "") != (source.get("name") or ""):
            v.fail(f"{version}: manifest name does not match the Production export")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", choices=sorted(DEFAULT_MANIFESTS), required=True)
    parser.add_argument("--manifest", default=None)
    parser.add_argument("--repo", default=".")
    parser.add_argument("--expect", type=int, default=None)
    parser.add_argument("--plan-out", default=None)
    parser.add_argument(
        "--production",
        default=None,
        help="optional read-only schema_migrations JSON export for a row-for-row cross-check",
    )
    args = parser.parse_args(argv)

    manifest = args.manifest or os.path.join(args.repo, DEFAULT_MANIFESTS[args.history])
    if not os.path.exists(manifest):
        print(f"FATAL: manifest not found: {manifest}", file=sys.stderr)
        return 2

    v = Validation()
    if args.history == "repo":
        plan = check_repo(manifest, args.repo, args.expect, v)
    else:
        plan = check_production(manifest, args.repo, args.expect, v)
        if args.production:
            check_production_against_export(read_jsonl(manifest), read_json(args.production), v)

    if not v.ok():
        print(f"PREFLIGHT FAILED ({args.history}): {len(v.errors)} error(s)", file=sys.stderr)
        for error in v.errors:
            print(f"  - {error}", file=sys.stderr)
        return 2

    if args.plan_out:
        with open(args.plan_out, "w") as fh:
            for entry in plan:
                fh.write(json.dumps(entry, sort_keys=True) + "\n")
    print(f"PREFLIGHT OK ({args.history}): {len(plan)} rows, unique versions, sources verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
