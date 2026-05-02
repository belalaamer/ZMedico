// Lightweight global data synchronization layer.
//
// Goal: when any CRUD operation (insert/update/delete/upsert) succeeds against
// a Supabase table, notify every screen that depends on that table so it can
// refetch automatically — no page refresh needed.
//
// How it works:
// 1. We monkey-patch `supabase.from(...)` so any mutation builder, when it
//    resolves successfully, emits an event for that table (and all related
//    tables — e.g. a payments mutation also nudges dashboard/treasury/invoices
//    consumers).
// 2. Components subscribe via `useDataSync(tables, callback)` to refetch.
// 3. Window focus / tab visibility changes also trigger a global "*" event.

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type Listener = (table: string) => void;

// table -> additional tables whose subscribers should also be notified
const RELATED: Record<string, string[]> = {
  patients: ["dashboard", "appointments", "invoices", "medical_records"],
  appointments: ["dashboard", "calendar"],
  invoices: ["dashboard", "payments", "treasury"],
  invoice_items: ["invoices", "dashboard"],
  payments: ["dashboard", "treasury", "invoices"],
  branches: ["dashboard", "settings", "*"],
  products: ["inventory", "stock_alerts", "dashboard"],
  inventory: ["products", "stock_alerts", "dashboard"],
  inventory_transactions: ["inventory", "products", "stock_alerts", "dashboard"],
  purchase_orders: ["inventory", "dashboard"],
  purchase_order_items: ["purchase_orders", "inventory"],
  staff: ["dashboard", "departments"],
  profiles: ["staff", "dashboard"],
  departments: ["staff", "dashboard"],
  positions: ["staff", "dashboard"],
  medical_records: ["dashboard", "prescriptions", "patients"],
  prescriptions: ["dashboard", "medical_records"],
  expenses: ["dashboard", "treasury"],
  treasury_transactions: ["dashboard", "treasury"],
  insurance_claims: ["dashboard", "invoices"],
  notifications: ["notifications"],
  reminders: ["reminders", "dashboard"],
};

const listeners = new Set<Listener>();

function emit(table: string) {
  const tables = new Set<string>([table, "*", ...(RELATED[table] ?? [])]);
  listeners.forEach((l) => {
    tables.forEach((t) => {
      try { l(t); } catch { /* swallow */ }
    });
  });
}

/** Manually emit a sync event (e.g. after a non-Supabase mutation). */
export function notifyDataChange(table: string) {
  emit(table);
}

/** Subscribe a callback. Returns an unsubscribe function. */
export function subscribeDataSync(tables: string[] | "*", cb: Listener): () => void {
  const want = tables === "*" ? null : new Set(tables);
  const wrapped: Listener = (t) => {
    if (!want || want.has(t) || t === "*") cb(t);
  };
  listeners.add(wrapped);
  return () => { listeners.delete(wrapped); };
}

/**
 * React hook: refetch when any of the given tables (or "*") change.
 * `tables` may include logical names like "dashboard" too.
 */
export function useDataSync(tables: string[] | "*", cb: () => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    const unsub = subscribeDataSync(tables, () => cbRef.current());
    return unsub;
  }, [Array.isArray(tables) ? tables.join(",") : tables]);
}

// ---------- Monkey-patch supabase.from to auto-emit on mutations ----------

const MUTATION_METHODS = new Set(["insert", "update", "delete", "upsert"]);
let patched = false;

function wrapBuilder(builder: any, table: string): any {
  // Proxy the builder so that:
  //  - calling a mutation method marks the chain as "mutating"
  //  - awaiting the chain emits an event on success
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (prop === "then" && typeof value === "function") {
        // Wrap the thenable to intercept resolution
        const isMutating = (target as any).__zmedicoMutating === true;
        if (!isMutating) return value.bind(target);
        return (onFulfilled: any, onRejected: any) =>
          value.call(target, (res: any) => {
            try {
              if (res && !res.error) emit(table);
            } catch { /* ignore */ }
            return onFulfilled ? onFulfilled(res) : res;
          }, onRejected);
      }

      if (typeof value !== "function") return value;

      return (...args: any[]) => {
        const ret = value.apply(target, args);
        if (MUTATION_METHODS.has(String(prop))) {
          if (ret && typeof ret === "object") {
            (ret as any).__zmedicoMutating = true;
            return wrapBuilder(ret, table);
          }
        }
        // Filter / chain methods return a new builder — keep wrapping so the
        // mutating flag set further up the chain survives.
        if (ret && typeof ret === "object" && (ret as any).then) {
          if ((target as any).__zmedicoMutating) {
            (ret as any).__zmedicoMutating = true;
          }
          return wrapBuilder(ret, table);
        }
        return ret;
      };
    },
  });
}

function patchSupabase() {
  if (patched) return;
  patched = true;
  const originalFrom = supabase.from.bind(supabase);
  (supabase as any).from = (table: string) => {
    const builder = originalFrom(table as any);
    return wrapBuilder(builder, table);
  };
}

patchSupabase();

// ---------- Global focus / visibility refresh ----------

let globalListenersAttached = false;

export function attachGlobalRefreshListeners() {
  if (globalListenersAttached || typeof window === "undefined") return;
  globalListenersAttached = true;
  const fire = () => emit("*");
  window.addEventListener("focus", fire);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fire();
  });
}
