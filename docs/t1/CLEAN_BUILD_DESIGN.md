# T1 — Clean-build design: two histories, two tests

This document designs the replacement for the current
`tools/t1/clean-build.sh`. It does **not** implement replay-safety fixes and
does not change any migration.

The current script is unsafe for the question T1 is asking:

1. It `cp`s `supabase/migrations/*.sql` and
   `supabase/migrations.recovered/*.sql` into one directory. Two filenames
   collide (`20260922051415…`, `20260922081824…`) and the second copy silently
   overwrites the first. The loss is invisible: the file count drops from 525 to
   523, and the script reports “all 523 applied”.
2. It sorts by filename, not by a verified history. The three recovered files
   whose names repeat the version (`20261101120000_20261101120000_…`) sort
   beside the real repo file with the same version. Both can be applied; the
   script never checks for duplicate versions.
3. It treats “the file ran” as “the migration is correct”. A migration that
   no-ops, applies to the wrong history, or is not replay-safe is counted as
   applied.
4. It merges a repository history (436 files, repo versions) with a Production
   history (486 rows, Production versions). The result is neither history.
5. It does not verify `platform-base.sql`; the base is a hand-written mock.
6. It has no manifest, no hashes and no provenance, so a later edit to a
   migration cannot be distinguished from the text that was analysed.

The replacement has **two independent builds** and a **separate comparison
step**. They must never share a build directory.

## 1. Directory and manifest layout

```
tools/t1/
  history/
    repo-history.json          # 436 records, repo versions
    repo-annotations.json      # duplicate-content decisions (resolved/reapply/unresolved)
    production-history.jsonl   # 486 records, Production versions
    production/
      sql/                     # exact Production statements for the 2 conflicts
  platform-base.sql            # declared base (apply-compatible until verified)
  platform-reference.sql       # dump-derived reference (future)
  platform-catalog.json        # signatures/grants/roles (future)
  clean-build.sh               # --history repo | --history production
  schema-diff.sh               # dumps/fingerprints and compares
```

### 1.1 `repo-history.json`

One record per active repository migration:

```json
{
  "history": "repo",
  "generated_from": "supabase/migrations",
  "files": [
    {
      "version": "20260501172659",
      "path": "supabase/migrations/20260501172659_….sql",
      "sha256": "…",
      "bytes": 6522
    }
  ]
}
```

Rules:

- exactly 436 records at the reviewed commit;
- versions are unique and strictly increasing in manifest order;
- every path is inside `supabase/migrations/` and ends in `.sql`;
- the filename starts with the record's 14-digit version;
- `sha256` is over the exact file bytes.

### 1.2 `production-history.jsonl`

One JSON object per line, in Production `version` order:

```json
{"ordinal":1,"version":"20260501172658","name":"","class":"B_reversioned",
 "resolution":"unique_name",
 "source":{"type":"repo","path":"supabase/migrations/20260501172659_….sql",
           "sha256":"…","token_sha256":"…"},
 "production_statements_sha256":"…","production_token_sha256":"…",
 "production_bytes":6522,
 "content_duplicate_of":"","content_duplicate_with":"","reapply_reason":""}
```

Source types:

| `class` | Count | `source.type` | Meaning |
|---|---|---|---|
| `A_exact` | 72 | `repo` | Same version and token stream. |
| `B_reversioned` | 341 | `repo` | Same token stream, different version. |
| `A2_registration_note` | 3 | `repo` | Production row is a note; apply the cited repo file after checking md5/bytes. |
| `C_same_version_conflict` | 2 | `production` | Apply the exact Production statements from `history/production/sql/`. |
| `D_no_exact_match` | 68 | `recovered` | Apply the recovered Production SQL. |

For a registration note, the repo source also carries:

```json
"source": {"type":"repo","path":"…","sha256":"…","note":
  {"text_sha256":"…","text":"…","cited_md5":"…","cited_bytes":4635,
   "repo_md5":"…","repo_bytes":4635,"verified":true}}
```

For an intentional re-application (the coverage grant), the later record
carries:

```json
"content_duplicate_of": "20260825215716",
"content_duplicate_with": "20260825215716",
"reapply_reason": "ZMED-302 restores the same EXECUTE grant after a later revoke"
```

Rules:

- exactly 486 records at the reviewed Production state;
- versions are unique and strictly increasing;
- every `source` exists and its raw SHA-256 matches the record;
- for `repo` sources, the file's token hash matches
  `production_token_sha256`, and the raw statement hash is recorded separately
  in `production_statements_sha256`; the build recomputes both;
- for `production` sources, the text equals the Production `statements` join
  after trimming only leading/trailing line separators, and the raw hash
  matches;
- for `recovered` sources, the body after the provenance header matches the
  Production `statements` under the same line-separator trimming (it is raw,
  not token, equality; the recovered file adds only separator newlines);
- for `A2`, the cited repo file's md5 and UTF-8 byte count match the note;
- no record may have `class` `ambiguous` or `needs_review`; unresolved rows
  block the build;
- `candidates` lists every token-equal repo file. A resolved row may name one
  in `source`; an unresolved row keeps the full list and leaves `source`
  unresolved. The preflight prints that list and stops.

The manifest is generated by the analysis tool, reviewed, and committed. The
build never infers a source at runtime.

## 2. Test R — repository history

**Question:** can the repository alone build the schema it describes?

### Preflight (no database)

Run before creating a database; any failure exits 2 with a specific message.

1. `repo-history.json` exists and parses.
2. Record count is the expected count (436 at this commit).
3. Every version is exactly 14 digits, unique, and strictly increasing in
   manifest order.
4. Every path is inside `supabase/migrations/`, exists, ends in `.sql`, and its
   filename starts with its version.
5. Every SHA-256 and byte count matches.
6. The active directory contains no `.sql` file that is missing from the
   manifest and no manifest record that is missing from the directory.
7. No path points into `supabase/migrations.recovered/`, `history/production/`
   or any other history.
8. Duplicate token content is detected. It is allowed only when
   `repo-annotations.json` marks the group `resolved` (one canonical member,
   `duplicate_of` on the other) or `intentional_reapply` (both files apply,
   with a reason). `unresolved` fails and prints both versions.
9. `platform-base.sql` exists and its hash is recorded.

This is implemented in `tools/t1/history_preflight.py`; the build calls it
before creating a database. At the reviewed commit it deliberately exits 2 on
the patient-code pair (`20260503000512` / `20260503000555`), because the
repository has not decided whether those are one migration or two.

### Build

- Create a throwaway database; never use a database whose name does not start
  with the build prefix.
- Load `platform-base.sql` with `ON_ERROR_STOP`; fail if it fails.
- For each manifest record, in manifest order:
  - apply exactly one file with `psql -v ON_ERROR_STOP=1 -f`;
  - capture stdout/stderr, exit code, wall time, and the SQLSTATE of the first
    error;
  - record `version`, `path`, `sha256`, `applied_at`, `duration_ms`;
  - if the file fails, stop immediately; do not continue to the next file.
- Do not use `ls | sort` as the order source. The manifest is the order.
- Do not use `cp` into a shared directory. Apply the manifest path directly, or
  copy into a private directory only after the preflight proves there is no
  collision.

### Postconditions

1. Applied count equals manifest count; no skipped record.
2. A build ledger (`schema_migrations`-equivalent table created by the harness,
   not by the migrations) has exactly the manifest versions, once each.
3. `pg_dump --schema-only` produces `repo-schema.sql`.
4. A catalog fingerprint is written to `repo-catalog.json`.
5. The platform base contract test passes (see §5).
6. The build reports `REPO BUILD OK` only when all of the above hold.

A partial build reports `REPO BUILD PARTIAL: n of N`, the failing record, the
SQLSTATE and the first 20 lines of stderr, and exits 1.

## 3. Test P — Production history

**Question:** can the exact Production history be rebuilt from the recorded
rows, without using the repository's version order?

### Preflight (no database)

1. `production-history.jsonl` exists and parses; 486 records.
2. Versions are unique and strictly increasing; the ordinal is contiguous.
3. Every record has a known class and a resolvable source.
4. Every source hash matches.
5. For `repo` sources, the file's token hash equals the Production token hash.
6. For `production` sources, the raw text hash equals the Production hash.
7. For `recovered` sources, the body hash equals the Production hash.
8. For `A2`, the note's cited md5/bytes match the repo file.
9. No cross-history path is used except the explicitly allowed `repo` sources.
10. The two `C` records are present and are the only records for those
    versions.
11. The intentional re-application is annotated; the build does not collapse
    the two coverage-grant rows.
12. `tools/t1/history_preflight.py --history production` passes all 486 rows.
    At the reviewed commit it deliberately exits 2 on `20260503000554`, the
    one Production row whose SQL matches two repo files and whose name does
    not identify one.
13. When the read-only Production export is supplied with `--production`, the
    manifest is cross-checked row for row: count, version order, name, raw
    statement hash and token hash. A dropped, added or edited row fails.

### Build

- Create a separate throwaway database.
- Load the same verified platform base.
- Apply all 486 records in Production version order, from the manifest sources.
- For `A2`, apply the cited repo SQL and record the note text hash as
  provenance; never execute the prose.
- For `C`, apply the exact Production statements.
- For `D`, apply the recovered body.
- For `B`, apply the repo file; record both the Production version and the repo
  version in the ledger.
- Write `production-schema.sql`, `production-catalog.json`, and a ledger with
  486 rows.

### Postconditions

1. 486 ledger rows, one per Production version.
2. Every row has `source_type`, `source_path`, `source_sha256` and
   `production_statements_sha256`.
3. The 3 notes have `executed_sql = repo file` and `note_sha256` recorded.
4. The 2 conflicts have `executed_sql = production statements`.
5. The 2 coverage-grant rows are both present, with `content_duplicate_of` on
   the later one.
6. `PRODUCTION BUILD OK` only when all of the above hold.

## 4. Collision and duplication rules

| Condition | Result |
|---|---|
| Same filename in two histories | The histories are separate; if a build sees both, **fatal**. |
| Same version twice in one history | **Fatal**, print both paths. |
| Same version in both histories with different SQL | Allowed only as separate histories; **fatal** if merged. |
| Same token content in two files in one history | **Fatal** unless the group is annotated `intentional_reapply` with a reason, or `resolved` with one canonical member and `duplicate_of` on the other. |
| Same token content in two Production rows | Allowed; require `content_duplicate_of`/`reapply_reason`; do not collapse. |
| Same logical name, different version/content | Allowed; record as `related`/`near_duplicate`; never auto-substitute. |
| A recovered body is a registration note | **Fatal** if treated as SQL; must be an `A2` record. |
| A manifest source hash drifts | **Fatal**; do not rebuild from the edited file. |
| A migration applies zero statements | Warning + ledger record; review, do not silently pass. |

The build must print the *reason* and the *two identities* for every fatal
condition. A generic “duplicate migration” message is not enough; the operator
must see `version`, `path`, `sha256`, and which history each side came from.

## 5. Platform base verification

`platform-base.sql` is a declaration, not a proven Supabase model. The build
must distinguish:

- **apply-compatible:** the migrations run on this base;
- **contract-verified:** the base's objects, signatures, grants and behaviour
  match a real Supabase reference for everything the migrations use.

The current base is only apply-compatible. To verify it:

1. Start a real Supabase stack at the same engine/CLI generation as Production
   (`supabase start`, or a disposable preview branch).
2. Dump the platform schemas (`auth`, `storage`, `realtime`, `vault`, `cron`,
   `net`, `graphql`, `extensions`, `supabase_migrations`,
   `supabase_functions`), roles, role memberships, default privileges and
   extension versions.
3. Store the reference as `platform-reference.sql` and a normalised
   `platform-catalog.json`.
4. Diff `platform-base.sql` against the reference. Every difference is either
   `intentional_subset` (with a reason and a usage proof) or a failure.
5. Run the same contract probes against both:
   - `auth.uid()` from `request.jwt.claim.sub` **and**
     `request.jwt.claims->>'sub'`;
   - `auth.jwt()` returns the claims JSON, not `{}`;
   - `auth.role()` reflects the current role;
   - `storage.foldername()` / `storage.filename()` signatures and results;
   - `cron.schedule()` writes a `cron.job` row with the expected columns;
   - `net.http_post()` signature/return type;
   - `service_role` bypasses RLS; `anon`/`authenticated` do not;
   - `authenticator` can `SET ROLE` to the three request roles;
   - `vault.decrypted_secrets` exposes only the intended columns.
6. The clean build runs the probes after loading the base and fails if a probe
   differs from the reference.

Until step 6 passes, the base header must say **apply-compatible only**, and a
green clean build must not be described as “Supabase-equivalent”.

## 6. Schema comparison

The clean builds are necessary but not sufficient. After both succeed:

1. `pg_dump --schema-only --no-owner` each database.
2. Normalise the dumps (strip comments, owner names, `SET` lines, OIDs).
3. Compare:
   - `repo-schema.sql` vs `production-schema.sql`;
   - `repo-schema.sql` vs a read-only Production catalog dump;
   - `production-schema.sql` vs the same dump.
4. For every difference, record:
   `object_type`, `identity`, `repo`, `production`, `classification`
   (`expected_repo_only`, `production_only`, `missing_from_build`, `defect`),
   `reason`, `owner`, `date`.
5. `known-differences.json` is an allow-list, not a blanket suppression. An
   object present in Production but missing from both builds is a failure
   unless it is explicitly listed as a known out-of-band object with a
   follow-up.
6. The first known example is the treatment-plan invoice trigger: it exists in
   Production, #281 replaces its function, and no repository migration creates
   the trigger. T1 must add it explicitly; the schema diff is how we prove it.

## 7. What “clean build OK” means

It means all of the following, not just “psql exited 0”:

- the manifest is complete and hash-verified;
- every record applied exactly once, in the manifest's order;
- no duplicate version, filename or unannotated duplicate content;
- the platform base probes pass;
- the schema dump exists and the comparison has no unclassified difference;
- the build's ledger matches the manifest.

CI and Workers builds are separate signals. They do not replace this test.

## 8. Implementation order (before replay-safety)

1. `repo-history.json` and `production-history.jsonl` are generated for review.
   The preflight already proves all counts, order, hashes and provenance, and
   stops on the two unresolved ambiguities. Do not build past those stops.
2. Split the recovered corpus: 68 absent SQL, 2 conflict editions, 16 duplicate
   records (no SQL), 3 note records.
3. Implement `clean-build.sh --history repo|production` with the preflight,
   manifest-driven apply, ledger and failure semantics above.
4. Implement `schema-diff.sh` and the catalog fingerprint.
5. Build the platform reference and run the contract probes.
6. Run Test R and Test P; fix harness bugs only. Do not edit migrations yet.
7. Only after both builds and the schema diff are stable, start replay-safety
   fixes one at a time, each with a before/after test.
