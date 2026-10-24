import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const state = vi.hoisted(() => ({
  setSessionCalls: [] as Array<{ access_token: string; refresh_token: string }>,
  getSessionResults: [] as Array<unknown>,
  appliedSession: null as unknown,
  listeners: [] as Array<(event: string, session: unknown) => void>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      setSession: async (credentials: { access_token: string; refresh_token: string }) => {
        state.setSessionCalls.push(credentials);
        return { data: { session: state.appliedSession }, error: null };
      },
      getSession: async () => ({ data: { session: state.getSessionResults.shift() ?? null }, error: null }),
      getUser: async () => ({ data: { user: { id: 'stored-user' } }, error: null }),
      signOut: async () => ({ data: { error: null } }),
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        state.listeners.push(callback);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));

vi.mock('@/contexts/I18nContext', () => ({ useI18n: () => ({ t: (key: string) => key, lang: 'ar' }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

const canonical = 'sb-project-a-auth-token';
const stored = {
  access_token: 'stored-access',
  refresh_token: 'stored-refresh',
  expires_at: 2000000000,
  user: { id: 'stored-user' },
} as unknown as Session;
const arriving = '?next=/patient-portal#access_token=arriving-access&refresh_token=arriving-refresh&type=invite';

async function mountProvider(url: string) {
  window.history.replaceState({}, '', url);
  // The redirect-carrying decision is frozen per document, so each case needs its own module graph.
  vi.resetModules();
  const { AuthProvider } = await import('./AuthContext');
  const view = render(<AuthProvider><div /></AuthProvider>);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

describe('session handoff from an auth provider redirect', () => {
  beforeEach(() => {
    state.setSessionCalls = [];
    state.getSessionResults = [];
    state.listeners = [];
    state.appliedSession = stored;
    localStorage.clear();
    sessionStorage.clear();
    vi.stubEnv('VITE_SUPABASE_PROJECT_ID', 'project-a');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('does not replay the stored session over the one arriving in the URL', async () => {
    localStorage.setItem(canonical, JSON.stringify(stored));
    await mountProvider(`/auth/callback${arriving}`);
    expect(state.setSessionCalls).toEqual([]);
  });

  it('does not persist the stored session again while a redirect is arriving', async () => {
    localStorage.setItem(canonical, JSON.stringify(stored));
    sessionStorage.removeItem(canonical);
    await mountProvider(`/auth/callback${arriving}`);
    expect(JSON.parse(localStorage.getItem(canonical)!)).toEqual(stored);
    expect(sessionStorage.getItem(canonical)).toBeNull();
  });

  it('replays the stored session on an ordinary load', async () => {
    localStorage.setItem(canonical, JSON.stringify(stored));
    await mountProvider('/patients');
    expect(state.setSessionCalls).toEqual([{ access_token: 'stored-access', refresh_token: 'stored-refresh' }]);
    expect(JSON.parse(sessionStorage.getItem(canonical)!)).toEqual(stored);
  });

  it('replays the stored session when the redirect carries no session', async () => {
    localStorage.setItem(canonical, JSON.stringify(stored));
    await mountProvider('/auth/callback?error_description=invalid+token');
    expect(state.setSessionCalls).toEqual([{ access_token: 'stored-access', refresh_token: 'stored-refresh' }]);
  });

  it('treats a password-recovery code as an arriving session too', async () => {
    localStorage.setItem(canonical, JSON.stringify(stored));
    await mountProvider('/auth/callback?code=synthetic-auth-code');
    expect(state.setSessionCalls).toEqual([]);
  });
});
