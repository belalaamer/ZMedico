#!/usr/bin/env python3
"""Generate the repo and production history manifests from a local tree.

The Production input is the read-only schema_migrations query result. This
script never connects to Production. It writes manifests and, for the two
same-version conflicts, the exact Production SQL needed to rebuild the
Production history separately from the repository history.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import migration_match as mm  # noqa: E402


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def sha256_file(path: str) -> str:
    with open(path, "rb") as fh:
        return sha256_bytes(fh.read())


def rel(path: str) -> str:
    return path.replace(os.sep, "/")


REPO_DUPLICATE_DECISIONS = {
    ("20260503000512", "20260503000555"): {
        "status": "unresolved",
        "reason": (
            "token-identical repo files; Production has one row with this content. "
            "Choose the canonical file and mark the other duplicate_of before the build."
        ),
    },
    ("20260826030000", "20261025090000"): {
        "status": "intentional_reapply",
        "reason": (
            "the same REVOKE/GRANT is a deliberate second application at a later version; "
            "both files are real repository history and neither is a duplicate to drop."
        ),
    },
}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--production", required=True, help="read-only schema_migrations JSON export")
    parser.add_argument("--repo", default=".")
    parser.add_argument("--out", default="tools/t1/history")
    parser.add_argument(
        "--force-annotations",
        action="store_true",
        help="overwrite repo-annotations.json instead of preserving a human decision",
    )
    args = parser.parse_args(argv)

    repo_root = os.path.abspath(args.repo)
    out_dir = os.path.join(repo_root, args.out)
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(os.path.join(out_dir, "production", "sql"), exist_ok=True)

    with open(args.production) as fh:
        production = json.load(fh)
    mapping, _disposition, files, by_version, by_hash, _recovered = mm.classify(production, repo_root)

    # --- repo history -----------------------------------------------------
    repo_records = []
    token_groups = collections.defaultdict(list)
    for path in files:
        base = os.path.basename(path)
        version = base[:14]
        with open(path, errors="ignore") as fh:
            text = fh.read()
        token = mm.statement_hash(text)
        token_groups[token].append(version)
        repo_records.append({
            "version": version,
            "path": rel(os.path.relpath(path, repo_root)),
            "sha256": sha256_file(path),
            "bytes": os.path.getsize(path),
            "token_sha256": token,
        })
    repo_records.sort(key=lambda r: r["version"])
    repo_manifest = {
        "history": "repo",
        "generated_from": "supabase/migrations",
        "record_count": len(repo_records),
        "files": repo_records,
    }
    with open(os.path.join(out_dir, "repo-history.json"), "w") as fh:
        json.dump(repo_manifest, fh, indent=2)
        fh.write("\n")

    duplicate_groups = []
    for token, versions in token_groups.items():
        if len(versions) > 1:
            key = tuple(sorted(versions))
            decision = REPO_DUPLICATE_DECISIONS.get(key, {
                "status": "unresolved",
                "reason": "token-identical repo files; a human must choose or annotate a re-application.",
            })
            duplicate_groups.append({"versions": list(key), **decision})
    annotations_path = os.path.join(out_dir, "repo-annotations.json")
    if os.path.exists(annotations_path) and not args.force_annotations:
        print("repo-annotations.json exists; kept (use --force-annotations to regenerate)")
    else:
        with open(annotations_path, "w") as fh:
            json.dump({"duplicate_groups": duplicate_groups}, fh, indent=2)
            fh.write("\n")

    # --- production history ----------------------------------------------
    prod_by_version = {r["version"]: r for r in production}
    prod_groups = collections.defaultdict(list)
    for row in production:
        sql = "\n".join(row.get("statements") or [])
        prod_groups[mm.statement_hash(sql, row.get("statements"))].append(row["version"])
    for versions in prod_groups.values():
        versions.sort()

    lines = []
    for index, item in enumerate(mapping, 1):
        version = item["production_version"]
        row = prod_by_version[version]
        statements = row.get("statements") or []
        sql = "\n".join(statements)
        prod_raw = sha256_text(sql.strip("\n"))
        prod_token = mm.statement_hash(sql, statements)
        cls = item["class"]
        resolution = item["resolution"]
        source = {"type": "unresolved", "path": "", "sha256": ""}

        if cls in ("A_exact", "B_reversioned") and item["repo_file"]:
            path = os.path.join(repo_root, "supabase", "migrations", item["repo_file"])
            with open(path, errors="ignore") as fh:
                repo_text = fh.read()
            source = {
                "type": "repo",
                "path": rel(os.path.relpath(path, repo_root)),
                "sha256": sha256_file(path),
                "token_sha256": mm.statement_hash(repo_text),
            }
        elif cls == "A2_registration_note":
            path = os.path.join(repo_root, "supabase", "migrations", item["repo_file"])
            text = open(path, errors="ignore").read()
            note = item.get("notes", "")
            md5 = re.search(r"md5=([0-9a-f]{32})", note)
            size = re.search(r"bytes=(\d+)", note)
            actual_md5 = hashlib.md5(text.encode()).hexdigest()
            actual_bytes = len(text.encode("utf-8"))
            source = {
                "type": "repo",
                "path": rel(os.path.relpath(path, repo_root)),
                "sha256": sha256_file(path),
                "token_sha256": mm.statement_hash(text),
                "note": {
                    "text_sha256": sha256_text(sql),
                    "text": sql,
                    "cited_md5": md5.group(1) if md5 else "",
                    "cited_bytes": int(size.group(1)) if size else None,
                    "repo_md5": actual_md5,
                    "repo_bytes": actual_bytes,
                    "verified": bool(md5 and size and md5.group(1) == actual_md5 and int(size.group(1)) == actual_bytes),
                },
            }
        elif cls == "C_same_version_conflict":
            filename = f"{version}.sql"
            path = os.path.join(out_dir, "production", "sql", filename)
            with open(path, "w") as fh:
                fh.write(sql)
            source = {
                "type": "production",
                "path": rel(os.path.relpath(path, repo_root)),
                "sha256": sha256_file(path),
                "token_sha256": prod_token,
            }
        elif cls == "D_no_exact_match":
            rec = _recovered.get(version)
            if rec:
                path = os.path.join(repo_root, "supabase", "migrations.recovered", rec["file"])
                body = rec["body"].strip("\n")
                source = {
                    "type": "recovered",
                    "path": rel(os.path.relpath(path, repo_root)),
                    "sha256": sha256_file(path),
                    "body_sha256": sha256_text(body),
                    "token_sha256": mm.statement_hash(body),
                }

        if resolution == "unresolved":
            source = {"type": "unresolved", "path": "", "sha256": ""}

        record = {
            "ordinal": index,
            "version": version,
            "name": item["production_name"],
            "class": cls,
            "resolution": resolution,
            "source": source,
            "production_statements_sha256": prod_raw,
            "production_token_sha256": prod_token,
            "production_bytes": len(sql.encode("utf-8")),
            "content_duplicate_of": item.get("content_duplicate_of", ""),
            "content_duplicate_with": item.get("content_duplicate_with", ""),
            "reapply_reason": item.get("reapply_reason", ""),
            "ambiguity": item.get("ambiguity", ""),
            "candidates": [
                candidate for candidate in item.get("repo_candidates", "").split("|")
                if candidate
            ],
        }
        lines.append(record)

    with open(os.path.join(out_dir, "production-history.jsonl"), "w") as fh:
        for record in lines:
            fh.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")

    print(f"repo-history.json: {len(repo_records)} records")
    print(f"production-history.jsonl: {len(lines)} records")
    print(f"repo duplicate groups: {len(duplicate_groups)}")
    unresolved = [r["version"] for r in lines if r["resolution"] == "unresolved"]
    print(f"unresolved production rows: {len(unresolved)}" + (f" ({', '.join(unresolved)})" if unresolved else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
