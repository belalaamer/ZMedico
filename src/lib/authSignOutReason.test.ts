import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markSignOutReason, takeSignOutReason } from './authSignOutReason';

describe('sign-out attribution', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    takeSignOutReason();
    vi.useRealTimers();
  });

  it('hands the reason to exactly one consumer', () => {
    markSignOutReason("user");
    expect(takeSignOutReason()).toBe("user");
    expect(takeSignOutReason()).toBeNull();
  });

  it('expires a reason no SIGNED_OUT event consumed', () => {
    markSignOutReason("user");
    vi.advanceTimersByTime(10_001);
    // A stale mark would silence the notice for a session lost minutes later.
    expect(takeSignOutReason()).toBeNull();
  });

  it('keeps a reason recorded just before the event arrives', () => {
    markSignOutReason("idle");
    vi.advanceTimersByTime(50);
    expect(takeSignOutReason()).toBe("idle");
  });
});
