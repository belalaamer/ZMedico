import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("public booking gateway hardening", () => {
  const page = readFileSync(
    resolve(process.cwd(), "src/pages/booking/PublicBooking.tsx"),
    "utf8",
  );
  const edge = readFileSync(
    resolve(process.cwd(), "supabase/functions/public-booking-submit/index.ts"),
    "utf8",
  );
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260924161000_rate_limit_public_booking.sql"),
    "utf8",
  );
  const config = readFileSync(
    resolve(process.cwd(), "supabase/config.toml"),
    "utf8",
  );

  it("routes anonymous browser submissions through the Edge gateway", () => {
    expect(page).toContain('supabase.functions.invoke("public-booking-submit"');
    expect(page).not.toContain('publicRpc<BookingResult>("public_create_booking_for_tenant"');
  });

  it("rate limits by both client network and phone identity", () => {
    expect(edge).toContain("public-booking:ip:");
    expect(edge).toContain("public-booking:phone:");
    expect(edge.match(/consume_public_booking_rate_limit/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("bounds limiter storage growth with indexed TTL cleanup", () => {
    expect(migration).toContain("public_booking_rate_limits_updated_at_idx");
    expect(migration).toContain("cleanup-public-booking-rate-limits");
    expect(migration).toContain("updated_at < now() - interval '48 hours'");
  });

  it("closes the raw anonymous booking RPC bypass", () => {
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.public_create_booking_for_tenant");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });

  it("declares the public gateway as an unauthenticated Edge endpoint", () => {
    expect(config).toContain("[functions.public-booking-submit]");
    expect(config).toContain("verify_jwt = false");
  });
});
