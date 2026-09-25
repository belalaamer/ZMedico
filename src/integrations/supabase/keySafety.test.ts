import { describe, expect, it } from "vitest";
import {
  assertSafeBrowserSupabaseKey,
  isOpaquePublishableSupabaseKey,
} from "./keySafety";

describe("Supabase browser key safety", () => {
  it("accepts a publishable key", () => {
    expect(assertSafeBrowserSupabaseKey("sb_publishable_example")).toBe(
      "sb_publishable_example",
    );
    expect(isOpaquePublishableSupabaseKey("sb_publishable_example")).toBe(true);
  });

  it("keeps legacy anon keys compatible", () => {
    expect(assertSafeBrowserSupabaseKey("legacy-anon-jwt")).toBe(
      "legacy-anon-jwt",
    );
    expect(isOpaquePublishableSupabaseKey("legacy-anon-jwt")).toBe(false);
  });

  it("rejects secret keys before browser bundling", () => {
    expect(() => assertSafeBrowserSupabaseKey("sb_secret_example")).toThrow(
      /secret key/i,
    );
  });

  it("rejects missing configuration", () => {
    expect(() => assertSafeBrowserSupabaseKey("")).toThrow(/required/i);
    expect(() => assertSafeBrowserSupabaseKey(undefined)).toThrow(/required/i);
  });
});
