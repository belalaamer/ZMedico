# Production migration history records

**These are not active migrations.** Nothing in this directory is applied by the
normal repository build.

Each file is the verbatim `statements` text of one row from Production
`supabase_migrations.schema_migrations`, with a provenance header. The corpus
exists so the Production history can be rebuilt separately from the repository
history. Copying these files into `supabase/migrations/` would mix two different
version histories and is forbidden by the T1 design.

## Status

The first pass treated all 89 files as missing migrations. Review 2 corrected
that: the corpus is a mixture of four different things.

| Classification | Count | What it is | Action |
|---|---|---|---|
| `absent` | 68 | Production SQL with no exact token-equivalent repo file. | Keep for the Production-history build; only 44 have no near counterpart and are new-integration candidates. |
| `same_version_conflict` | 2 | The version and name exist in the repo, but the SQL differs. | Keep as the Production edition; never substitute for the repo edition. |
| `formatting_duplicate` | 16 | Token-identical to an existing repo file; only whitespace/dollar-tag/wrapper differences. | Do not treat as a new migration. The repo file is the canonical SQL. |
| `registration_note` | 3 | The Production row is prose that registers an out-of-band apply and cites a repo file. | The prose is not SQL. The Production-history build applies the cited repo file after verifying its md5 and byte count. |

`MANIFEST.json` carries the classification, disposition, repo counterpart and
similarity for every entry. For a `same_version_conflict` the counterpart is
the other edition, not an equivalent. The full 486-row mapping is
`docs/t1/MIGRATION_MAPPING.csv`; the 89-row disposition is
`docs/t1/MIGRATION_RECOVERED_DISPOSITION.csv`.

## Rules

- Do not run these files against Production.
- Do not copy them into `supabase/migrations/`.
- Do not add them to a build that also contains `supabase/migrations/`.
- The Production-history build reads this directory through
  `production-history.jsonl`, not by globbing `*.sql`.
- The three `registration_note` files must never be executed; they are prose.

See `docs/t1/MIGRATION_INVENTORY.md` and `docs/t1/CLEAN_BUILD_DESIGN.md`.
