import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import authContextSource from "../contexts/AuthContext.tsx?raw";
import { clearPersistedAuthSessions, getAuthStorageSnapshot, hasPersistedAuthSession, persistAuthSessionForPreview, readPersistedAuthSession } from "./authSessionPersistence";
const canonical = "sb-project-a-auth-token", other = "sb-project-b-auth-token";
const own = { access_token: "synthetic-own-access", refresh_token: "synthetic-own-refresh", expires_at: 2000000000, user: { id: "actor-a" } } as Session;
const foreign = { ...own, access_token: "synthetic-foreign-access", user: { id: "actor-b" } } as Session;
beforeEach(() => { vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "project-a"); vi.stubEnv("VITE_SUPABASE_URL", "https://project-a.supabase.co"); localStorage.clear(); sessionStorage.clear(); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); localStorage.clear(); sessionStorage.clear(); });
describe("project-scoped session persistence", () => {
  it("does not read a session from another backend's storage key", () => {
    localStorage.setItem(other, JSON.stringify(foreign));
    expect(readPersistedAuthSession()).toBeNull(); expect(hasPersistedAuthSession()).toBe(false);
  });
  it("does not overwrite another project's session while persisting the current one", () => {
    localStorage.setItem(other, JSON.stringify(foreign)); sessionStorage.setItem(other, JSON.stringify(foreign));
    persistAuthSessionForPreview(own, "unit-test");
    expect(JSON.parse(localStorage.getItem(canonical)!)).toEqual(own);
    expect(JSON.parse(localStorage.getItem(other)!)).toEqual(foreign);
    expect(JSON.parse(sessionStorage.getItem(other)!)).toEqual(foreign);
  });
  it("clears only the current backend session on logout", () => {
    for (const storage of [localStorage, sessionStorage]) { storage.setItem(canonical, JSON.stringify(own)); storage.setItem(other, JSON.stringify(foreign)); }
    clearPersistedAuthSessions();
    for (const storage of [localStorage, sessionStorage]) { expect(storage.getItem(canonical)).toBeNull(); expect(JSON.parse(storage.getItem(other)!)).toEqual(foreign); }
  });
  it("reads the matching sessionStorage fallback, never a foreign one", () => {
    sessionStorage.setItem(canonical, JSON.stringify(own));
    expect(readPersistedAuthSession()).toEqual(own);
  });
  it("does not throw when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Storage blocked", "SecurityError"); });
    expect(() => hasPersistedAuthSession()).not.toThrow(); expect(hasPersistedAuthSession()).toBe(false);
  });
  it("does not stop logout cleanup if local storage removal throws", () => {
    sessionStorage.setItem(canonical, JSON.stringify(own));
    const remove = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function(this: Storage, key: string) { if (this === localStorage) throw new DOMException("Storage blocked", "SecurityError"); return remove.call(this, key); });
    expect(() => clearPersistedAuthSessions()).not.toThrow(); expect(sessionStorage.getItem(canonical)).toBeNull();
  });
  it("uses the matching fallback when localStorage is malformed", () => {
    localStorage.setItem(canonical, "invalid-json");
    sessionStorage.setItem(canonical, JSON.stringify(own));
    expect(readPersistedAuthSession()).toEqual(own);
  });
  it("preserves the local session as the primary source", () => {
    localStorage.setItem(canonical, JSON.stringify(own));
    sessionStorage.setItem(canonical, JSON.stringify(foreign));
    expect(readPersistedAuthSession()).toEqual(own);
  });
  it("does not let a blocked localStorage property prevent fallback", () => {
    sessionStorage.setItem(canonical, JSON.stringify(own));
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    expect(readPersistedAuthSession()).toEqual(own);
    expect(() => getAuthStorageSnapshot()).not.toThrow();
  });
  it("still persists to sessionStorage when localStorage quota is exhausted", () => {
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key: string, value: string) {
      if (this === localStorage) throw new DOMException("Full", "QuotaExceededError");
      return set.call(this, key, value);
    });
    expect(() => persistAuthSessionForPreview(own, "test")).not.toThrow();
    expect(readPersistedAuthSession()).toEqual(own);
  });
  it("does not log persistence details in production", () => {
    vi.stubEnv("DEV", false);
    persistAuthSessionForPreview(own, "test");
    expect(console.info).not.toHaveBeenCalled();
  });
  it("does not fall back to another project when configuration is absent", () => {
    vi.stubEnv("VITE_SUPABASE_PROJECT_ID", ""); vi.stubEnv("VITE_SUPABASE_URL", "");
    localStorage.setItem(other, JSON.stringify(foreign));
    expect(readPersistedAuthSession()).toBeNull();
    persistAuthSessionForPreview(own, "test"); clearPersistedAuthSessions();
    expect(JSON.parse(localStorage.getItem(other)!)).toEqual(foreign);
  });
  it("the actual logout cleanup body still clears sessions if clearing the branch preference throws", () => {
    sessionStorage.setItem(canonical, JSON.stringify(own));
    const body = authContextSource.match(/function clearLocalAppState\(\) \{([\s\S]*?)\n\}/)?.[1];
    expect(body).toBeTruthy();
    const run = new Function("localStorage", "clearPersistedAuthSessions", body!);
    run({ removeItem: () => { throw new DOMException("Blocked", "SecurityError"); } }, clearPersistedAuthSessions);
    expect(sessionStorage.getItem(canonical)).toBeNull();
  });
});
