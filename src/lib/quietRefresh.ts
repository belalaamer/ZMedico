// A board that re-reads itself should not go blank while it does.
//
// The appointment Queue re-reads on every `postgres_changes` event for the
// branch, on every reconnect, and after every desk action (check-in, start,
// complete, no-show, room, reassign, walk-in). The pending booking-request list
// re-reads the same way. Both gated their whole board on `loading`, so every
// read replaced the rows the desk was in the middle of reading with grey bars or
// a "Loading…" card for its full length — several times a minute on a busy day,
// and always at the moment a row changed under someone's hands.
//
// A read that ends with the rows it started from needs no placeholder at all, so
// the rule is "only when there is nothing to keep": blank the board for a first
// read, and stay quiet while refreshing a board that already holds this branch's
// rows. Both pages therefore clear their rows when the selected branch changes —
// without that, the quiet half of this rule would be allowed to show one
// clinic's board under another clinic's name.
//
// Filters are deliberately not part of the rule. A filter that matches nothing
// is a choice the desk made, and it gets the empty state, not a spinner.

/**
 * Whether a live board should still be replaced by its loading placeholder.
 *
 * `loadedRows` is what the board holds for the branch currently selected,
 * before any filtering — the filters are the desk's view, not the board's state.
 */
export function showLoadingPlaceholder(loading: boolean, loadedRows: number): boolean {
  return loading && loadedRows === 0;
}
