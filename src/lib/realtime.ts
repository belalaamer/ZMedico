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

export function subscribeResilient(opts: SubscribeResilientOptions): () => void {
  const maxBackoff = opts.maxBackoffMs ?? 30_000;
  let stopped = false;
  let current: RealtimeChannel | null = null;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let everSubscribed = false;

  const cleanupCurrent = () => {
    if (current) {
      try { supabase.removeChannel(current); } catch { /* ignore */ }
      current = null;
    }
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
        if (current === ch) cleanupCurrent();
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
