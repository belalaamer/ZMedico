import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";

// E11. `verify_jwt` is not stored anywhere the repo can diff: it travels to the
// platform only when `supabase functions deploy` reads `supabase/config.toml`, and
// it defaults to `true`. Production was measured on 2026-10-30 with 22 functions,
// 9 of them running with `verify_jwt = false` while this repo declared exactly one.
// Every undeclared one was therefore one ordinary deploy away from silently
// flipping its gateway check on -- and for `whatsapp-webhook`, whose caller (Meta)
// sends no Authorization header at all, a flip means every inbound customer message
// stops reaching the clinic.
//
// This test is the tripwire: the declared set must equal the measured set, and it
// must name only functions that actually have a source directory.
const CONFIG_PATH = "supabase/config.toml";
const FUNCTIONS_DIR = "supabase/functions";

// Read from Production (`GET /v1/projects/<ref>/functions`), 2026-10-30.
const PRODUCTION_VERIFY_JWT_FALSE = [
  "detect-queue-alerts",
  "enqueue-lead-followups",
  "enqueue-physio-followups",
  "enqueue-winback",
  "login-by-identifier",
  "public-booking-submit",
  "public-subscription-request",
  "send-reminder",
  "whatsapp-webhook",
].sort();

function declaredSettings(): Map<string, boolean> {
  const toml = readFileSync(CONFIG_PATH, "utf8");
  const found = new Map<string, boolean>();
  const block = /\[functions\.([a-z0-9-]+)\]([^[]*)/g;
  for (const match of toml.matchAll(block)) {
    const slug = match[1] as string;
    const body = match[2] ?? "";
    const flag = /verify_jwt\s*=\s*(true|false)/.exec(body);
    if (!flag) {
      throw new Error(`[functions.${slug}] declares no verify_jwt`);
    }
    found.set(slug, flag[1] === "true");
  }
  return found;
}

function sourceDirs(): string[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)
    .sort();
}

it("declares every function Production runs with verify_jwt = false", () => {
  const declared = declaredSettings();
  const off = [...declared.entries()].filter(([, value]) => value === false).map(([key]) => key).sort();
  expect(off).toEqual(PRODUCTION_VERIFY_JWT_FALSE);
});

it("declares only functions that exist in the repo", () => {
  const declared = [...declaredSettings().keys()];
  const dirs = sourceDirs();
  for (const slug of declared) {
    expect(dirs, `supabase/functions/${slug} is missing but config.toml declares it`).toContain(slug);
  }
});

it("leaves the remaining functions at the platform default instead of weakening them", () => {
  const declared = declaredSettings();
  const off = [...declared.entries()].filter(([, value]) => value === false);
  // The 13 functions Production runs with verify_jwt = true must not gain a
  // `false` block: that would be a security-posture change smuggled into config.
  const remaining = sourceDirs().filter((slug) => !off.some(([name]) => name === slug));
  for (const slug of remaining) {
    expect(declared.get(slug) ?? true, `[functions.${slug}] must stay verified`).toBe(true);
  }
  expect(remaining.length).toBe(13);
});

it("documents why each declared function is exempt, in the file itself", () => {
  const toml = readFileSync(CONFIG_PATH, "utf8");
  // A bare `verify_jwt = false` with no reason next to it is what gets removed by
  // the next person who "cleans up" the config.
  const blocks = [...toml.matchAll(/\[functions\.([a-z0-9-]+)\]/g)].map((match) => match[1] as string);
  expect(blocks.length).toBe(PRODUCTION_VERIFY_JWT_FALSE.length);
  expect(toml).toContain("Meta's webhook callbacks carry an HMAC signature");
  expect(toml).toContain("pg_cron / pg_net dispatchers");
  expect(toml).toContain("Production on 2026-10-30");
});
