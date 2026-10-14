import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261012061953_disambiguate_self_checkin_record_aliases.sql", "utf8");

describe("self check-in record alias migration", () => {
  it("rejects drift from the reviewed live functions", () => {
    expect(migration).toContain("77e933132e78d93719f81ad92ad41e89");
    expect(migration).toContain("4175f97c130e7e975ac9d8dae86c0efd");
    expect(migration).toContain("definition drifted; review before applying");
  });

  it("supports the prior idempotency migration's renamed implementation", () => {
    expect(migration).toContain("public.public_self_checkin_unserialized(text)");
    expect(migration).toContain("1403b26a331f88175940999a67ee6222");
    expect(migration).toMatch(/if to_regprocedure\('public\.public_self_checkin_unserialized\(text\)'\) is not null/i);
  });

  it("changes table aliases without changing record variables or guards", () => {
    expect(migration).toContain("FROM public.self_checkin_tokens tok");
    expect(migration).toContain("FROM public.appointments appt");
    expect(migration).toContain("INTO s");
    expect(migration).toContain("INTO a");
    expect(migration).toContain("execute replace(v_definition, v_old, v_new)");
  });
});
