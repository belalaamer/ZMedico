#!/usr/bin/env python3
"""Compare Production's schema_migrations rows with the repository migrations.

This is a provenance tool, not a semantic-equivalence prover. It answers one
question precisely: "does this Production row's SQL have an exact token
equivalent in the repository, and under which version?"

Matching is statement-aware:

- SQL is split into top-level statements first. A semicolon inside a string,
  quoted identifier, comment or dollar-quoted body does not split a statement.
- The statement *boundaries* are part of the comparison. `A; B` and `A B` are
  different, even if their flattened words are the same.
- A leading `BEGIN` and trailing `COMMIT`/`ROLLBACK` are stripped only when
  they are complete outer statements. An inner transaction is preserved.
- Within a statement, comments and whitespace are ignored, dollar-quote tag
  names are ignored, and tokens are compared in order. Semicolons inside a
  dollar-quoted PL/pgSQL body are tokens, so two different bodies do not become
  equal just because their words are the same.
- String literals and quoted identifiers keep their exact value and case.

The match is a provenance match, not a proof of semantic equivalence. The
schema build and schema diff decide behaviour.

Usage:
  python3 tools/t1/migration_match.py \
      --production /tmp/prod_full.json \
      --repo . \
      --out docs/t1

`--production` is a JSON array of {version, name, statements} rows, as returned
by a read-only query against supabase_migrations.schema_migrations. The file is
not committed: it is the live Production state, and this tool never writes to
Production.

Exit status: 0 on analysis, 2 if --strict and a structural collision is found.
"""
from __future__ import annotations

import argparse
import collections
import csv
import glob
import hashlib
import json
import os
import re
import sys


# ---------------------------------------------------------------------------
# SQL statement splitting and tokenisation
# ---------------------------------------------------------------------------

def _is_escape_string(sql: str, quote_pos: int) -> bool:
    """True for E'...' and U&'...' where backslash can escape the quote."""
    if quote_pos >= 1 and sql[quote_pos - 1] in "Ee":
        before = sql[quote_pos - 2] if quote_pos >= 2 else ""
        if not (before.isalnum() or before in "_$"):
            return True
    if quote_pos >= 2 and sql[quote_pos - 1] == "&" and sql[quote_pos - 2] in "Uu":
        before = sql[quote_pos - 3] if quote_pos >= 3 else ""
        if not (before.isalnum() or before in "_$"):
            return True
    return False


def _string_end(sql: str, quote_pos: int, escape_backslash: bool) -> int:
    j = quote_pos + 1
    n = len(sql)
    while j < n:
        c = sql[j]
        if escape_backslash and c == "\\":
            j += 2
            continue
        if c == "'":
            if j + 1 < n and sql[j + 1] == "'":
                j += 2
                continue
            return j + 1
        j += 1
    return n


def _dollar_quote(sql: str, pos: int):
    m = re.match(r"\$([A-Za-z_][A-Za-z0-9_]*)?\$", sql[pos:])
    if not m:
        return None
    tag = m.group(1) or ""
    start = pos + m.end()
    close = "$" + tag + "$"
    end = sql.find(close, start)
    if end < 0:
        return None
    return tag, start, end, end + len(close)


def split_statements(sql: str) -> list[str]:
    """Split SQL into top-level statements.

    Semicolons inside comments, string literals, quoted identifiers and
    dollar-quoted bodies are not separators. Empty statements are dropped.
    """
    statements: list[str] = []
    buf: list[str] = []
    i = 0
    n = len(sql)
    while i < n:
        c = sql[i]
        if c == "-" and i + 1 < n and sql[i + 1] == "-":
            j = sql.find("\n", i + 2)
            i = n if j < 0 else j + 1
            buf.append(" ")
            continue
        if c == "/" and i + 1 < n and sql[i + 1] == "*":
            depth = 1
            j = i + 2
            while j < n and depth:
                if sql.startswith("/*", j):
                    depth += 1
                    j += 2
                elif sql.startswith("*/", j):
                    depth -= 1
                    j += 2
                else:
                    j += 1
            i = j
            buf.append(" ")
            continue
        if c == "'":
            end = _string_end(sql, i, _is_escape_string(sql, i))
            buf.append(sql[i:end])
            i = end
            continue
        if c == '"':
            j = i + 1
            while j < n:
                if sql[j] == '"':
                    if j + 1 < n and sql[j + 1] == '"':
                        j += 2
                        continue
                    break
                j += 1
            end = j + 1 if j < n else n
            buf.append(sql[i:end])
            i = end
            continue
        if c == "$":
            d = _dollar_quote(sql, i)
            if d:
                _tag, _start, _end, after = d
                buf.append(sql[i:after])
                i = after
                continue
        if c == ";":
            statement = "".join(buf).strip()
            if statement:
                statements.append(statement)
            buf = []
            i += 1
            continue
        buf.append(c)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


def tokens(sql: str) -> list[tuple[str, str]]:
    """Tokenise one SQL statement.

    Semicolons are emitted as tokens. At the top level they have already been
    consumed by split_statements(); inside a dollar-quoted PL/pgSQL body they
    remain as statement boundaries and must not be ignored.
    """
    out: list[tuple[str, str]] = []
    i = 0
    n = len(sql)
    while i < n:
        c = sql[i]
        if c.isspace():
            i += 1
            continue
        if c == "-" and i + 1 < n and sql[i + 1] == "-":
            j = sql.find("\n", i + 2)
            i = n if j < 0 else j + 1
            continue
        if c == "/" and i + 1 < n and sql[i + 1] == "*":
            depth = 1
            j = i + 2
            while j < n and depth:
                if sql.startswith("/*", j):
                    depth += 1
                    j += 2
                elif sql.startswith("*/", j):
                    depth -= 1
                    j += 2
                else:
                    j += 1
            i = j
            continue
        if c == "$":
            d = _dollar_quote(sql, i)
            if d:
                _tag, start, end, after = d
                out.append(("DOLLAR_OPEN", ""))
                out.extend(tokens(sql[start:end]))
                out.append(("DOLLAR_CLOSE", ""))
                i = after
                continue
        m = re.match(r"(?:[Ee]|[Uu]&|[Bb]|[Xx])?'", sql[i:])
        if m and m.group(0).endswith("'"):
            prefix = m.group(0)[:-1]
            if prefix and not re.match(r"(?i)^(e|u&|b|x)$", prefix):
                prefix = ""
            end = _string_end(sql, i + len(prefix), prefix.lower() in ("e", "u&"))
            raw = sql[i + len(prefix):end]
            out.append(("STR", prefix.lower() + ":" + raw))
            i = end
            continue
        if c == '"':
            j = i + 1
            buf = []
            while j < n:
                if sql[j] == '"':
                    if j + 1 < n and sql[j + 1] == '"':
                        buf.append('"')
                        j += 2
                        continue
                    break
                buf.append(sql[j])
                j += 1
            out.append(("QIDENT", "".join(buf)))
            i = j + 1 if j < n else n
            continue
        if c.isalpha() or c == "_":
            j = i + 1
            while j < n and (sql[j].isalnum() or sql[j] in "_$"):
                j += 1
            out.append(("WORD", sql[i:j].lower()))
            i = j
            continue
        if c.isdigit():
            j = i + 1
            while j < n and (sql[j].isdigit() or sql[j] == "."):
                j += 1
            out.append(("NUM", sql[i:j]))
            i = j
            continue
        op = None
        for candidate in ("->>", "#>>", "::", ":=", "=>", "<=", ">=", "<>", "!=", "||", "->", "#>", "@>", "<@", "?&", "?|"):
            if sql.startswith(candidate, i):
                op = candidate
                break
        if op:
            out.append(("OP", op))
            i += len(op)
            continue
        out.append(("PUNCT", c))
        i += 1
    return out


_BEGIN_FORMS = {("begin",), ("begin", "transaction"), ("begin", "work")}
_END_FORMS = {
    ("commit",), ("commit", "transaction"), ("commit", "work"),
    ("rollback",), ("rollback", "transaction"), ("rollback", "work"),
    ("end",), ("end", "transaction"), ("end", "work"),
}


def _words(toks: list[tuple[str, str]]) -> tuple[str, ...]:
    return tuple(value for kind, value in toks if kind == "WORD")


def strip_outer_transaction(statements: list[list[tuple[str, str]]]) -> list[list[tuple[str, str]]]:
    """Strip only a complete outer BEGIN ... COMMIT/ROLLBACK wrapper."""
    if len(statements) >= 2:
        if _words(statements[0]) in _BEGIN_FORMS and _words(statements[-1]) in _END_FORMS:
            return statements[1:-1]
    return statements


def normalise_statements(sql: str, statements: list[str] | None = None) -> list[list[tuple[str, str]]]:
    """Return the canonical list of statement token streams.

    `statements` is the Production `statements` array when available. Each
    element may itself contain more than one top-level statement; splitting
    each element preserves that.
    """
    chunks = statements if statements is not None else [sql]
    parsed: list[str] = []
    for chunk in chunks:
        parsed.extend(split_statements(chunk))
    toks = [tokens(statement) for statement in parsed if statement.strip()]
    return strip_outer_transaction([t for t in toks if t])


def statement_hash(sql: str, statements: list[str] | None = None) -> str:
    return hashlib.sha256(repr(normalise_statements(sql, statements)).encode()).hexdigest()


def logical_name(name: str) -> str:
    n = (name or "").strip().lower()
    n = re.sub(r"^\d{14}[_-]+", "", n)
    return re.sub(r"[^a-z0-9]+", "_", n).strip("_")


def flattened(sql: str, statements: list[str] | None = None) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for statement in normalise_statements(sql, statements):
        out.extend(statement)
        out.append(("STMT", ""))
    return out


def shingles(toks: list[tuple[str, str]], size: int = 4) -> set[tuple]:
    return {tuple(toks[i:i + size]) for i in range(max(1, len(toks) - size + 1))}


def similarity(a: str, b: str, a_statements: list[str] | None = None, b_statements: list[str] | None = None) -> float:
    sa = shingles(flattened(a, a_statements))
    sb = shingles(flattened(b, b_statements))
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


# ---------------------------------------------------------------------------
# Repository / recovered / Production inputs
# ---------------------------------------------------------------------------

def load_repo(repo: str):
    files = sorted(glob.glob(os.path.join(repo, "supabase", "migrations", "*.sql")))
    by_version = {}
    by_hash = collections.defaultdict(list)
    for path in files:
        base = os.path.basename(path)
        version = base[:14]
        text = open(path, errors="ignore").read()
        entry = {
            "file": base,
            "version": version,
            "text": text,
            "hash": statement_hash(text),
            "bytes": len(text.encode("utf-8")),
        }
        by_version[version] = entry
        by_hash[entry["hash"]].append(entry)
    return files, by_version, by_hash


def load_recovered(repo: str):
    out = {}
    for path in sorted(glob.glob(os.path.join(repo, "supabase", "migrations.recovered", "*.sql"))):
        base = os.path.basename(path)
        version = base[:14]
        text = open(path, errors="ignore").read()
        body = re.sub(r"^(?:--[^\n]*\n)+", "", text)
        out[version] = {
            "file": base,
            "text": text,
            "body": body,
            "hash": statement_hash(body),
        }
    return out


def note_check(note: str, repo_entry: dict) -> dict:
    md5 = re.search(r"md5\s+([0-9a-f]{32})", note)
    size = re.search(r"(\d+)\s+bytes", note)
    return {
        "md5": md5.group(1) if md5 else "",
        "bytes": int(size.group(1)) if size else None,
        "md5_ok": bool(md5) and hashlib.md5(repo_entry["text"].encode("utf-8")).hexdigest() == md5.group(1),
        "bytes_ok": bool(size) and len(repo_entry["text"].encode("utf-8")) == int(size.group(1)),
    }


def is_registration_note(sql: str) -> bool:
    return sql.lstrip().startswith("Registered ") and "Source of truth for the SQL bytes" in sql


# A re-application is not a duplicate row to drop. It is a second Production
# row with the same SQL at a later version. The reason is recorded explicitly;
# the mapping keeps both rows and the preflight refuses an unannotated pair.
REAPPLY_REASONS = {
    ("20261027174432", "20260825215716"): "ZMED-302 restores the same EXECUTE grant after a later revoke",
}


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def classify(production: list[dict], repo: str):
    files, by_version, by_hash = load_repo(repo)
    recovered = load_recovered(repo)

    prod_hashes: dict[str, str] = {}
    prod_groups: dict[str, list[str]] = collections.defaultdict(list)
    for row in production:
        sql = "\n".join(row.get("statements") or [])
        digest = statement_hash(sql, row.get("statements"))
        prod_hashes[row["version"]] = digest
        prod_groups[digest].append(row["version"])
    for versions in prod_groups.values():
        versions.sort()

    mapping = []
    for row in sorted(production, key=lambda r: r["version"]):
        version = row["version"]
        name = (row.get("name") or "").strip()
        statements = row.get("statements") or []
        sql = "\n".join(statements)
        digest = prod_hashes[version]
        same = by_version.get(version)
        candidates = by_hash.get(digest, [])
        is_note = is_registration_note(sql)

        group = prod_groups[digest]
        content_duplicate_of = group[0] if len(group) > 1 and group[0] != version else ""
        content_duplicate_with = "|".join(v for v in group if v != version)
        reapply_reason = REAPPLY_REASONS.get((version, content_duplicate_of), "")

        item = {
            "production_version": version,
            "production_name": name,
            "production_kind": "registration_note" if is_note else "sql",
            "production_bytes": len(sql.encode("utf-8")),
            "class": "",
            "match_type": "",
            "resolution": "",
            "repo_file": "",
            "repo_version": "",
            "repo_candidates": "",
            "near_repo_file": "",
            "similarity": "",
            "ambiguity": "",
            "content_duplicate_of": content_duplicate_of,
            "content_duplicate_with": content_duplicate_with,
            "reapply_reason": reapply_reason,
            "action": "",
            "notes": "",
        }

        if same and same["hash"] == digest:
            item.update(
                **{
                    "class": "A_exact",
                    "match_type": "same_version_exact_content",
                    "resolution": "same_version",
                    "repo_file": same["file"],
                    "repo_version": same["version"],
                    "repo_candidates": same["file"],
                    "similarity": "1.000",
                    "action": "none; canonical repo file",
                }
            )
        elif same and is_note:
            check = note_check(sql, same)
            item.update(
                **{
                    "class": "A2_registration_note",
                    "match_type": "registration_note_repo_source",
                    "resolution": "registration_note_verified" if check["md5_ok"] and check["bytes_ok"] else "registration_note_mismatch",
                    "repo_file": same["file"],
                    "repo_version": same["version"],
                    "repo_candidates": same["file"],
                    "similarity": "n/a",
                    "action": "keep repo file; production row is a bookkeeping note, not SQL",
                    "notes": (
                        f"md5={check['md5']} md5_ok={check['md5_ok']}; "
                        f"bytes={check['bytes']} bytes_ok={check['bytes_ok']}"
                    ),
                }
            )
        elif same:
            score = similarity(sql, same["text"], statements, None)
            item.update(
                **{
                    "class": "C_same_version_conflict",
                    "match_type": "same_version_different_sql",
                    "resolution": "same_version_conflict",
                    "repo_candidates": same["file"],
                    "near_repo_file": same["file"],
                    "similarity": f"{score:.3f}",
                    "ambiguity": "same version+name, different SQL",
                    "action": "do not substitute; choose edition per history",
                    "notes": "production statements and repo file diverge",
                }
            )
        elif candidates:
            ordered = sorted(
                candidates,
                key=lambda x: (
                    logical_name(os.path.basename(x["file"])[15:-4]) != logical_name(name),
                    abs(int(x["version"]) - int(version)),
                ),
            )
            name_matches = [
                x for x in ordered
                if logical_name(os.path.basename(x["file"])[15:-4]) == logical_name(name)
            ]
            if len(ordered) == 1:
                best = ordered[0]
                resolution = "single_candidate"
                ambiguity = ""
            elif len(name_matches) == 1:
                best = name_matches[0]
                resolution = "unique_name"
                ambiguity = f"{len(ordered)} repo files share this token content; resolved by unique name"
            else:
                best = None
                resolution = "unresolved"
                ambiguity = (
                    f"{len(ordered)} repo files share this token content and the Production name "
                    "does not identify one of them; a human must choose"
                )
            if not best:
                action = "STOP: unresolved ambiguity; do not build until a human chooses"
            elif content_duplicate_of and not reapply_reason:
                action = (
                    "STOP: same content as an earlier Production row but no reapply_reason; "
                    "keep both rows and record why the second application is intentional"
                )
            elif content_duplicate_of:
                action = (
                    f"re-apply at this version; keep both {content_duplicate_of} and {version}; "
                    f"{reapply_reason}"
                )
            elif content_duplicate_with:
                action = (
                    f"keep this row; later re-application at {content_duplicate_with}; "
                    "do not drop either row"
                )
            else:
                action = "map to repo file; do not add recovered duplicate"
            item.update(
                **{
                    "class": "B_reversioned",
                    "match_type": "different_version_exact_content",
                    "resolution": resolution,
                    "repo_file": best["file"] if best else "",
                    "repo_version": best["version"] if best else "",
                    "repo_candidates": "|".join(x["file"] for x in ordered),
                    "similarity": "1.000",
                    "ambiguity": ambiguity,
                    "action": action,
                    "notes": "same normalized statement stream, different version",
                }
            )
        else:
            pool = [
                x for x in by_version.values()
                if logical_name(name) and logical_name(os.path.basename(x["file"])[15:-4]) == logical_name(name)
            ] or list(by_version.values())
            scored = sorted(
                ((similarity(sql, x["text"], statements, None), x) for x in pool),
                key=lambda pair: (-pair[0], abs(int(pair[1]["version"]) - int(version))),
            )
            if scored and scored[0][0] >= 0.35:
                score, near = scored[0]
                item.update(
                    **{
                        "class": "D_no_exact_match",
                        "match_type": "no_exact_content_match",
                        "resolution": "near_candidate",
                        "repo_candidates": near["file"],
                        "near_repo_file": near["file"],
                        "similarity": f"{score:.3f}",
                        "ambiguity": "near-duplicate; text/behaviour differs",
                        "action": "production-only; reconcile, do not add blindly",
                        "notes": "strong near match" if score >= 0.85 else "related but different",
                    }
                )
            else:
                item.update(
                    **{
                        "class": "D_no_exact_match",
                        "match_type": "no_exact_content_match",
                        "resolution": "no_counterpart",
                        "similarity": "0.000",
                        "action": "production-only; review as a candidate new migration",
                        "notes": "no repo counterpart at >=0.35 similarity",
                    }
                )
        mapping.append(item)

    disposition = []
    note_versions = {
        r["version"] for r in production
        if is_registration_note("\n".join(r.get("statements") or []))
    }
    conflict_versions = {item["production_version"] for item in mapping if item["class"] == "C_same_version_conflict"}
    for version, rec in sorted(recovered.items()):
        name = next((r.get("name") or "" for r in production if r["version"] == version), "").strip()
        if version in note_versions:
            cls = "A2_registration_note"
            repo_entry = by_version.get(version)
            score = "n/a"
            resolution = "registration_note"
            action = "replace recovered prose with a note record; build applies the cited repo file"
            notes = "production row is not SQL"
        elif version in conflict_versions:
            cls = "C_same_version_conflict"
            repo_entry = by_version.get(version)
            score = f"{similarity(rec['body'], repo_entry['text']):.3f}" if repo_entry else ""
            resolution = "same_version_conflict"
            action = "keep only in production-history corpus; never copy into repo migrations"
            notes = "same version/name but different SQL"
        elif rec["hash"] in by_hash:
            cls = "B_formatting_duplicate"
            repo_entry = sorted(by_hash[rec["hash"]], key=lambda x: abs(int(x["version"]) - int(version)))[0]
            score = "1.000"
            resolution = "token_identical"
            action = "drop from recovered corpus; repo file is token-identical"
            notes = "formatting/whitespace/dollar-tag only"
        else:
            cls = "D_absent"
            repo_entry = None
            score = "0.000"
            resolution = "no_counterpart"
            pool = [
                x for x in by_version.values()
                if logical_name(name) and logical_name(os.path.basename(x["file"])[15:-4]) == logical_name(name)
            ] or list(by_version.values())
            scored = sorted(
                ((similarity(rec["body"], x["text"]), x) for x in pool),
                key=lambda pair: (-pair[0], abs(int(pair[1]["version"]) - int(version))),
            )
            if scored and scored[0][0] >= 0.35:
                score = f"{scored[0][0]:.3f}"
                repo_entry = scored[0][1]
                resolution = "near_candidate"
                if scored[0][0] >= 0.85:
                    action = "keep in production-history corpus; strong near match, reconcile before any repo integration"
                    notes = "near duplicate"
                else:
                    action = "keep in production-history corpus; related to an existing repo file, review manually"
                    notes = "related"
            else:
                action = "keep in production-history corpus; no repo counterpart, candidate new migration"
                notes = "no near match"
        disposition.append(
            {
                "recovered_version": version,
                "production_name": name,
                "class": cls,
                "resolution": resolution,
                "near_repo_file": repo_entry["file"] if repo_entry else "",
                "repo_version": repo_entry["version"] if repo_entry else "",
                "similarity": score,
                "action": action,
                "notes": notes,
                "recovered_file": rec["file"],
            }
        )
    return mapping, disposition, files, by_version, by_hash, recovered


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def structural_collisions(files, by_version, recovered):
    """Duplicates within the active history, and collisions between histories."""
    filenames = collections.Counter(os.path.basename(f) for f in files)
    versions = collections.Counter(os.path.basename(f)[:14] for f in files)
    duplicate_files = {name: count for name, count in filenames.items() if count > 1}
    duplicate_versions = {version: count for version, count in versions.items() if count > 1}

    repo_names = set(filenames)
    rec_names = {entry["file"] for entry in recovered.values()}
    cross_filenames = sorted(repo_names & rec_names)
    cross_versions = sorted(set(by_version) & set(recovered))
    return duplicate_files, duplicate_versions, cross_filenames, cross_versions


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--production", required=True, help="JSON array of Production schema_migrations rows")
    parser.add_argument("--repo", default=".", help="repository root")
    parser.add_argument("--out", default="docs/t1", help="output directory for the CSV files")
    parser.add_argument("--strict", action="store_true", help="exit 2 on duplicate filenames or versions")
    args = parser.parse_args(argv)

    production = json.load(open(args.production))
    mapping, disposition, files, by_version, by_hash, recovered = classify(production, args.repo)

    os.makedirs(args.out, exist_ok=True)
    mapping_cols = [
        "production_version", "production_name", "production_kind", "production_bytes",
        "class", "match_type", "resolution", "repo_file", "repo_version", "repo_candidates",
        "near_repo_file", "similarity", "ambiguity", "content_duplicate_of",
        "content_duplicate_with", "reapply_reason", "action", "notes",
    ]
    with open(os.path.join(args.out, "MIGRATION_MAPPING.csv"), "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=mapping_cols, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(mapping)

    disposition_cols = [
        "recovered_version", "production_name", "class", "resolution", "near_repo_file",
        "repo_version", "similarity", "action", "notes", "recovered_file",
    ]
    with open(os.path.join(args.out, "MIGRATION_RECOVERED_DISPOSITION.csv"), "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=disposition_cols, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(disposition)

    counts = collections.Counter(item["class"] for item in mapping)
    rec_counts = collections.Counter(item["class"] for item in disposition)
    unresolved = [item["production_version"] for item in mapping if item["resolution"] == "unresolved"]
    print(f"Production rows: {len(mapping)}")
    print("Production classes: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    print(f"Repository files: {len(files)}; distinct token groups: {len(by_hash)}")
    print("Recovered rows: " + ", ".join(f"{k}={v}" for k, v in sorted(rec_counts.items())))
    print(f"Unresolved mappings: {len(unresolved)}" + (f" ({', '.join(unresolved)})" if unresolved else ""))
    duplicate_files, duplicate_versions, cross_filenames, cross_versions = structural_collisions(files, by_version, recovered)
    print(f"Duplicate filenames in supabase/migrations: {len(duplicate_files)}")
    print(f"Duplicate versions in supabase/migrations: {len(duplicate_versions)}")
    if duplicate_files:
        print("  " + ", ".join(sorted(duplicate_files)))
    if duplicate_versions:
        print("  " + ", ".join(sorted(duplicate_versions)))
    print(f"Cross-history filename collisions: {len(cross_filenames)}")
    for name in cross_filenames:
        print(f"  {name}")
    print(f"Cross-history version collisions: {len(cross_versions)}")
    for version in cross_versions:
        print(f"  {version}: {by_version[version]['file']} | {recovered[version]['file']}")
    if args.strict and (duplicate_files or duplicate_versions):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
