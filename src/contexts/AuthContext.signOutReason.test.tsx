import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const state = vi.hoisted(() => ({
  listeners: [] as Array<(event: string, session: unknown) => void>,
  toasts: [] as Array<{ title: string }>,
  providerSignOuts: 0,
  // A live client hands the stored session back from getSession(); returning null here
  // would drop `user` and un-arm the idle timer the test is about.
  session: {
    access_token: "stored-access",
    refresh_token: "stored-refresh",
    expires_at: 2000000000,
    user: { id: "staff-1" },
  },
  returnSession: true,
}));

function emit(event: string, session: unknown) {
  state.listeners.forEach((listener) => listener(event, session));
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      setSession: async () => ({ data: { session: state.returnSession ? state.session : null }, error: null }),
      getSession: async () => ({ data: { session: state.returnSession ? state.session : null }, error: null }),
      getUser: async () => ({ data: { user: { id: 'staff-1' } }, error: null }),
      // supabase-js fires SIGNED_OUT in the tab that asked for it, which is exactly
      // why the handler cannot tell a requested logout from a lost session on its own.
      signOut: async () => {
        state.providerSignOuts += 1;
        emit('SIGNED_OUT', null);
        return { data: { error: null } };
      },
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        state.listeners.push(callback);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));

vi.mock('@/contexts/I18nContext', () => ({ useI18n: () => ({ t: (key: string) => key, lang: 'ar' }) }));
vi.mock('@/hooks/use-toast', () => ({
  toast: (value: { title: string }) => {
    state.toasts.push(value);
    return { id: state.toasts.length };
  },
}));

const canonical = 'sb-project-a-auth-token';
const stored = state.session as unknown as Session;

const IDLE_MS = 30 * 60 * 1000;

/** Mounts the provider from a fresh module graph and hands back its context value. */
async function mount(url: string) {
  window.history.replaceState({}, '', url);
  vi.resetModules();
  const { AuthProvider, useAuth } = await import('./AuthContext');
  let ctx!: ReturnType<typeof useAuth>;
  const Probe = () => {
    ctx = useAuth();
    return null;
  };
  render(<AuthProvider><Probe /></AuthProvider>);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return { ctx: () => ctx };
}

describe('a session that ends must say why', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.listeners = [];
    state.toasts = [];
    state.providerSignOuts = 0;
    state.returnSession = true;
    localStorage.clear();
    sessionStorage.clear();
    vi.stubEnv('VITE_SUPABASE_PROJECT_ID', 'project-a');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('explains a session that ended with no sign-out request from this tab', async () => {
    localStorage.setItem(canonical, JSON.stringify(stored));
    await mount('/dashboard');
    await act(async () => {
      emit('SIGNED_OUT', null);
    });
    expect(state.toasts).toEqual([{ title: 'انتهت الجلسة. برجاء تسجيل الدخول مرة أخرى.' }]);
  });

  it('uses the same explanation in English when the interface is English', async () => {
    localStorage.setItem('zmedico.lang', 'en');
    localStorage.setItem(canonical, JSON.stringify(stored));
    await mount('/dashboard');
    await act(async () => {
      emit('SIGNED_OUT', null);
    });
    expect(state.toasts).toEqual([{ title: 'Your session ended. Please sign in again.' }]);
  });

  it('says nothing when no session was ever held in this tab', async () => {
    state.returnSession = false;
    await mount('/dashboard');
    await act(async () => {
      emit('SIGNED_OUT', null);
    });
    expect(state.toasts).toEqual([]);
  });

  it('keeps the menu sign-out as a single "signed out" notice', async () => {
    localStorage.setItem(canonical, JSON.stringify(stored));
    const { ctx } = await mount('/dashboard');
    await act(async () => {
      await ctx().signOut();
    });
    expect(state.providerSignOuts).toBe(1);
    expect(state.toasts).toEqual([{ title: 'signedOut' }]);
  });

  it('names inactivity when the idle timeout signs the desk out', async () => {
    localStorage.setItem(canonical, JSON.stringify(stored));
    await mount('/dashboard');
    state.toasts.length = 0;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_MS + 1);
    });
    expect(state.providerSignOuts).toBe(1);
    expect(state.toasts).toEqual([
      { title: 'تم تسجيل خروجك بعد فترة من عدم النشاط. برجاء تسجيل الدخول مرة أخرى.' },
    ]);
  });

  it('still says the account is unavailable for USER_DELETED', async () => {
    localStorage.setItem(canonical, JSON.stringify(stored));
    await mount('/dashboard');
    await act(async () => {
      emit('USER_DELETED', null);
    });
    expect(state.toasts).toEqual([
      { title: 'انتهت صلاحية الجلسة أو لم يعد الحساب متاحًا. برجاء تسجيل الدخول مرة أخرى.' },
    ]);
  });
});
