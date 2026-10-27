import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const state = vi.hoisted(() => ({
  session: null as unknown,
  getUserResult: { data: { user: { id: 'stored-user' } }, error: null } as unknown,
  getUserThrows: false,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      setSession: async () => ({ data: { session: null }, error: null }),
      getSession: async () => ({ data: { session: state.session }, error: null }),
      getUser: async () => {
        if (state.getUserThrows) throw new Error('validation threw');
        return state.getUserResult;
      },
      signOut: async () => ({ data: { error: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));
vi.mock('@/contexts/I18nContext', () => ({ useI18n: () => ({ t: (key: string) => key, lang: 'ar' }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { AuthProvider } from './AuthContext';

const session = {
  access_token: 'real-access-token',
  refresh_token: 'real-refresh-token',
  expires_at: 2000000000,
  user: { id: 'stored-user' },
} as unknown as Session;

// Captured instead of inspected through spy types: every argument list the provider logs.
const infos: unknown[][] = [];
const warns: unknown[][] = [];

async function mountAt(url: string) {
  window.history.replaceState({}, '', url);
  render(<AuthProvider><div /></AuthProvider>);
  await act(async () => {
    for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const payloads = (calls: unknown[][]) =>
  calls
    .flat()
    .filter((arg): arg is Record<string, unknown> => Boolean(arg) && typeof arg === 'object');

const serialized = () => JSON.stringify([infos, warns]);

beforeEach(() => {
  state.session = null;
  state.getUserResult = { data: { user: { id: 'stored-user' } }, error: null };
  state.getUserThrows = false;
  infos.length = 0;
  warns.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  vi.stubEnv('VITE_SUPABASE_PROJECT_ID', 'project-a');
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => { infos.push(args); });
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { warns.push(args); });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('S17: auth-debug logs must not carry the query string', () => {
  it('never prints a path containing the query, on any level', async () => {
    state.session = session;
    await mountAt('/patient-portal?token=INVITE-SECRET-VALUE&type=invite');
    const logged = payloads(infos).concat(payloads(warns));
    expect(logged.length).toBeGreaterThan(0);
    for (const payload of logged) {
      if (typeof payload.path === 'string') expect(payload.path).not.toContain('?');
    }
    expect(serialized()).not.toContain('INVITE-SECRET-VALUE');
  });

  it('logs the callback route without the PKCE code', async () => {
    await mountAt('/auth/callback?code=PKCE-SECRET-VALUE&next=/patients');
    expect(serialized()).not.toContain('PKCE-SECRET-VALUE');
    const paths = payloads(infos).map((p) => p.path).filter((p) => typeof p === 'string');
    expect(paths).toContain('/auth/callback');
    expect(payloads(infos).some((p) => p.hasQuery === true)).toBe(true);
  });

  it('scrubs the query from the retry warnings too', async () => {
    state.session = session;
    state.getUserResult = { data: { user: null }, error: { message: 'invalid token' } };
    await mountAt('/auth?redirect_ticket=TICKET-SECRET-VALUE');
    expect(warns.length).toBeGreaterThan(0);
    expect(JSON.stringify(warns)).not.toContain('TICKET-SECRET-VALUE');
    expect(payloads(warns).some((p) => p.hasQuery === true)).toBe(true);

    state.getUserThrows = true;
    infos.length = 0;
    warns.length = 0;
    await mountAt('/settings/security?code=ANOTHER-SECRET');
    expect(warns.length).toBeGreaterThan(0);
    expect(JSON.stringify(warns)).not.toContain('ANOTHER-SECRET');
    expect(payloads(warns).some((p) => p.hasQuery === true)).toBe(true);
  });
});
