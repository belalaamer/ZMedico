// Resilient realtime subscription helper.
//
// Wraps supabase.channel(...).subscribe() with:
//  - explicit CLOSED / TIMED_OUT / CHANNEL_ERROR handling
//  - exponential backoff reconnect (1s, 2s, 4s, ... capped at 30s)
//  - onReconnect callback fired after a *re*-subscription so callers can
//    refetch and recover any events missed while the channel was down
//  - unique channel names per attempt to avoid duplicate-channel errors
//  - cleanup that prevents further reconnect attempts after teardown
//
// The polling fallbacks in callers (30–60s ticks) remain as a safety net.
//
// ---------------------------------------------------------------------------
// REENTRANCY, and why the two small details below matter
//
// This helper crashed the app in production: 21 "Maximum call stack size
// exceeded" rejections on the landing page in 24 hours, recorded in
// client_errors with this stack:
//
//     at TR.makeRef  at xl.startTimeout  at xl.send
//     at xR.leave    at OR.unsubscribe   at HR.removeChannel
//
// The cause was that cleanupCurrent() called supabase.removeChannel() from
// INSIDE the channel's own subscribe status callback. Removing a channel makes
// it leave, which can emit another CLOSED status synchronously, which re-enters
// this same callback, which removes again — recursion until the stack is gone.
//
// The guard `if (current === ch)` did not stop it, because `current` was only
// cleared AFTER removeChannel returned. During the synchronous recursion the
// guard was still true every time. A reentrancy guard has to be closed before
// the dangerous call, not after it.
//
// Two changes fix it and both are needed:
//   1. `current` is cleared BEFORE the removal, so any re-entry is a no-op.
//   2. The removal is deferred out of the callback with setTimeout(0), so it
//      never runs on the callback's own stack in the first place.
// The promise from removeChannel is also swallowed explicitly — an unhandled
// rejection here is what surfaced the crash to the global handler.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ResilientBinder = (channel: RealtimeChannel) => RealtimeChannel;

export interface SubscribeResilientOptions {
  /** Stable base name used for the channel topic (a random suffix is appended). */
  name: string;
  /** Attach .on(...) handlers to the freshly-created channel and return it. */
  bind: ResilientBinder;
  /** Called after a successful *re*-subscription (not the first SUBSCRIBED). */
  onReconnect?: () => void;
  /** Cap on backoff between reconnect attempts. Defaults to 30s. */
  maxBackoffMs?: number;
}

/** Remove a channel off the current call stack, never throwing or rejecting. */
function removeChannelSafely(ch: RealtimeChannel) {
  setTimeout(() => {
    try {
      Promise.resolve(supabase.removeChannel(ch)).catch(() => {
        /* teardown failures are not actionable */
      });
    } catch {
      /* ignore */
    }
  }, 0);
}

export function subscribeResilient(opts: SubscribeResilientOptions): () => void {
  const maxBackoff = opts.maxBackoffMs ?? 30_000;
  let stopped = false;
  let current: RealtimeChannel | null = null;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let everSubscribed = false;

  const cleanupCurrent = () => {
    const ch = current;
    // Clear the reference FIRST. If removing the channel re-enters this
    // callback synchronously, `current` is already null and nothing recurses.
    current = null;
    if (ch) removeChannelSafely(ch);
  };

  const connect = () => {
    if (stopped) return;
    const topic = `${opts.name}-${Math.random().toString(36).slice(2, 8)}`;
    const ch = opts.bind(supabase.channel(topic));
    current = ch;
    ch.subscribe((status: string) => {
      if (stopped) return;
      if (status === "SUBSCRIBED") {
        const wasReconnect = everSubscribed;
        everSubscribed = true;
        retry = 0;
        if (wasReconnect && opts.onReconnect) {
          try { opts.onReconnect(); } catch { /* ignore */ }
        }
      } else if (
        status === "CLOSED" ||
        status === "TIMED_OUT" ||
        status === "CHANNEL_ERROR"
      ) {
        // Only the channel that is still current may trigger a reconnect. A
        // late status from a channel we already replaced is ignored.
        if (current !== ch) return;
        cleanupCurrent();
        const delay = Math.min(maxBackoff, 1000 * Math.pow(2, retry));
        retry += 1;
        if (timer) clearTimeout(timer);
        timer = setTimeout(connect, delay);
      }
    });
  };

  connect();

  return () => {
    stopped = true;
    if (timer) { clearTimeout(timer); timer = null; }
    cleanupCurrent();
  };
}
