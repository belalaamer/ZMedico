# ZMED-273 last usable owner

A sole owner could be suspended, terminated, banned or deleted while an owner role remained. This adds a private deferred availability invariant using the common administrative lock, with actual revision writes to reject stale REPEATABLE READ snapshots. Explicit staff linkage takes precedence over legacy id-only linkage. Logout is allowed.

Requires ZMED-258 and ZMED-270. Individual migration fails on drift, no usable owner or busy writers; it does not correct accounts or business data. Locks use NOWAIT. No externally accessible private objects or wider grants.

Isolated final deployable migration: run71c9558e,22 checks including native simultaneous suspension, legacy precedence, canonical role operations, SQL Auth availability mutations, stale snapshots, actual password update/login; cleanup146 original public tables restored with three documented recreated role-policy OIDs. Actual native Auth/Deno cross-deletion compatibility run45d871ed:20 checks,200/409,one owner remains; cleanup verified. Managed ban/deletion availability endpoint permutations and all saga failures are not exhaustively verified.
