// The Queue board reloads on every realtime appointment event and after every
// desk action (check-in, status change, room, reassign, walk-in). Each of those
// reads used to flip the whole table to a loading skeleton, so a working clinic
// watched its queue blank out and refill several times a minute — the rows that
// were already correct on screen were replaced by grey bars for a few hundred
// milliseconds, and the desk could not read a name during that flash.
//
// A read that ends with the rows it started from does not need a skeleton at
// all, so the rule is "only when there is nothing to keep": blank out the board
// for a first load, and stay quiet while refreshing a board that is already
// showing a branch's appointments.
//
// Filters are deliberately not part of the rule. A filter that matches nothing
// is a choice the desk made, and it gets the empty-state message; hiding the
// spinner there is what makes the message trustworthy rather than a race.

/**
 * Whether the queue table should be replaced by the loading skeleton.
 *
 * `loadedRows` is the number of appointments currently held on screen for this
 * branch — before filtering, because the filters are the desk's view, not the
 * board's state.
 */
export function showQueueSkeleton(loading: boolean, loadedRows: number): boolean {
  return loading && loadedRows === 0;
}
