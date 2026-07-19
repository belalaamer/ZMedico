/**
 * Shared search-input sanitizer for any string that will be concatenated
 * into a PostgREST filter (`.ilike()` pattern, `.or()` expression, etc.).
 *
 * Strips PostgREST filter meta-characters (`,` `(` `)` `"`), SQL LIKE
 * wildcards (`*` `%` `_` `\`), and single quotes, then caps the length
 * at 60 characters. This is the same rule used by the medication search
 * in `ConsultationDashboard.tsx` — extracted here so every call site
 * shares one implementation.
 */
export function sanitizeSearch(term: string): string {
  if (!term) return "";
  return term.replace(/[,()"'*\\%_]/g, "").slice(0, 60);
}