import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// `void_invoice_financials()` and the appointment cancel action do not remove
// anything: a void flips `invoices.status` to 'cancelled' (and soft-deletes the
// payments), a cancelled visit flips `appointments.status`, and the commission
// rows inherit 'cancelled'. Every read that filtered only `deleted_at` therefore
// kept showing and summing money and bookings the clinic already called off —
// the owner's «كأنها لم تكن». Batch 2 constrained every working and reporting
// read. This contract freezes that class: a new screen cannot join the app
// without either constraining `status` or being an announced supervisory read.
// The two money tables only — cancelled appointments are a status leak with its
// own supervisory screens (queue audit, calendar), so they are audited screen by
// screen rather than frozen here.
const TABLES = ["invoices", "doctor_commissions"] as const;

// Reads that exist to show the archive, so they must keep returning cancelled
// rows. Each is the supervision layer the mandate asks the trace to retreat to.
const SUPERVISORY_FILES: Record<string, string> = {
  // The patient's own ledger lists every invoice they ever had, cancelled ones
  // under a Cancelled badge, because "what did we bill and void for this
  // patient" is a supervisory question asked at the desk.
  "src/pages/patients/PatientProfile.tsx": "patient ledger keeps the voided rows visible as history",
  // The self-audit screens are the supervision surface by definition.
  "src/lib/systemSelfAudit.ts": "self-audit counts rows of every status on purpose",
};

// A read that resolves rows by identity is a detail lookup, not a working list:
// opening invoice 42 must show invoice 42 whatever its status.
const BY_ID = /\.(?:eq|in|or)\(\s*["'](?:[A-Za-z_.]*\.)?(?:id|invoice_id|invoices\.id)["']/;

const STATUS_CONSTRAINT = /\.(?:eq|neq|in|not|gt|lt)\(\s*["'][A-Za-z_.]*status["']/;

// A read of commissions already attached to a payroll run. Voiding an invoice
// cannot reach those rows: every 'cancelled' write in the ledger guards on
// `payroll_id IS NULL` (proved by the last test, so this allowance cannot rot
// if a future migration starts cancelling paid-off commissions).
const ATTACHED_TO_PAYROLL = /\.(?:eq|in)\(\s*["']payroll_id["']/;

// The verb that opens the chain decides whether it is a read at all: PostgREST
// writes answer with their own rows, so `.update(patch).select("id")` is a write
// even though it selects.
const VERBS = ["select", "insert", "update", "delete", "upsert"] as const;
function firstVerb(chain: string): (typeof VERBS)[number] | null {
  let hit: { at: number; verb: (typeof VERBS)[number] } | null = null;
  for (const verb of VERBS) {
    const at = chain.search(new RegExp(`\\.\\s*${verb}\\(`));
    if (at >= 0 && (!hit || at < hit.at)) hit = { at, verb };
  }
  return hit?.verb ?? null;
}

// Plain paths, not `new URL(literal, import.meta.url)`: Vite rewrites that form
// into a dev-server URL, and fs then fails on entries that are perfectly real.
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(SRC_ROOT, "..");

function sourceFiles(dir: string, prefix: string, out: { abs: string; rel: string }[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(abs, `${prefix}${entry.name}/`, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      out.push({ abs, rel: `${prefix}${entry.name}` });
    }
  }
  return out;
}

type Read = { file: string; line: number; table: string; chain: string };

// Does this line still belong to the builder chain opened above it? A leading
// dot is the obvious continuation; `q = q.eq(...)` — bare or under a one-line
// `if` — is how this app applies a conditional filter, and braces/else only
// wrap those steps. Any other line starts a different statement, so its filters
// cannot pay for this read.
const CHAIN_STEP = /^(?:if \([^)]*\)\s*)?([A-Za-z_$][\w$]*) = \1\.[a-z]+\(/;
const BLOCK_WRAP = /^[}{]$|^\}\s*else\s*\{?$|^else\s*\{?$/;
// A block opened only to wrap the next chain step. A semicolon would make the
// line a statement of its own, and a nested query is caught by the walk below.
const BLOCK_OPEN = /^(?:if\s*\(|else\b|\}\s*else\b).*\{$/;
const isChainLine = (line: string) =>
  line.startsWith(".")
  || CHAIN_STEP.test(line)
  || BLOCK_WRAP.test(line)
  || (BLOCK_OPEN.test(line) && !line.includes(";"));
const isNoiseLine = (line: string) => line === "" || /^(\/\/|\/\*|\*)/.test(line);

function readsIn(file: string, src: string): Read[] {
  const lines = src.split("\n");
  const found: Read[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const table = TABLES.find((t) => lines[i].includes(`from("${t}")`));
    if (!table) continue;
    const window: string[] = [lines[i]];
    for (let j = i + 1; j < lines.length && j < i + 20 && window.length < 14; j += 1) {
      // Stop where the next query or RPC starts, even mid-chain.
      if (/from\(["']|\.rpc\(/.test(lines[j])) break;
      const line = lines[j].trim();
      if (isNoiseLine(line)) continue;
      if (!isChainLine(line)) break;
      window.push(line);
    }
    found.push({ file, line: i + 1, table, chain: window.join(" ") });
  }
  return found;
}

// The trees a client-authored Supabase read can live in. Explicit rather than
// "everything under src", which also keeps the walk off the build-copied assets.
const ROOTS = ["pages", "components", "contexts", "hooks", "integrations", "lib"];

const all = ROOTS
  .flatMap((root) => sourceFiles(join(SRC_ROOT, root), `src/${root}/`))
  .map(({ abs, rel }) => readsIn(rel, readFileSync(abs, "utf8")))
  .flat();

const isRead = (r: Read) => firstVerb(r.chain) === "select";
const unconstrained = (r: Read) =>
  !BY_ID.test(r.chain)
  && !STATUS_CONSTRAINT.test(r.chain)
  // Named to its table: an invoices read can never borrow the payroll allowance.
  && !(r.table === "doctor_commissions" && ATTACHED_TO_PAYROLL.test(r.chain));

describe("cancelled-trace read contract (batch 2)", () => {
  it("finds the reads it is meant to freeze", () => {
    // Frozen census: batch 2 measured every invoices/doctor_commissions chain in
    // these trees. A new read has to appear as a constrained one, not by lifting
    // the numbers below.
    // Frozen census: batch 2 measured every invoices/doctor_commissions builder
    // chain in these trees — 32 chains, of which 26 are reads (19 invoices + 7
    // commissions). 24 of those constrain `status`, resolve rows by id, or read
    // only payroll-attached commissions; the 2 left are the supervisory
    // allow-list below. A new read must appear as a constrained one, not by
    // lifting these numbers.
    expect(all.length).toBe(32);
    expect(all.filter(isRead).length).toBe(26);
    expect(all.filter((r) => isRead(r) && r.table === "doctor_commissions").length).toBe(7);
    expect(all.filter((r) => isRead(r) && !unconstrained(r)).length).toBe(24);
  });

  it("never leaves a cancelled row inside a working or reporting read", () => {
    const offenders = all
      .filter(isRead)
      .filter((r) => !SUPERVISORY_FILES[r.file])
      .filter(unconstrained)
      .map((r) => `${r.file}:${r.line} [${r.table}] ${r.chain.trim().slice(0, 110)}`);
    expect(offenders).toEqual([]);
  });

  it("lists only supervisory files that really are read unfiltered", () => {
    const unfiltered = new Set(all.filter(isRead).filter(unconstrained).map((r) => r.file));
    // Every listed file must still be needed, otherwise the allow-list rots and
    // hides a new leak behind a stale entry.
    const stale = Object.keys(SUPERVISORY_FILES).filter((f) => !unfiltered.has(f));
    expect(stale).toEqual([]);
  });

  it("keeps the consultation write target off cancelled invoices", () => {
    // The consultation screen attaches newly added procedures to whichever
    // invoice this read returns, so that row is a write target rather than a
    // label: it must be picked with a status filter, and dropping the filter has
    // to fail here.
    const target = all.find((r) => r.file === "src/pages/medical/ConsultationDashboard.tsx" && r.table === "invoices" && isRead(r));
    expect(target).toBeDefined();
    expect(target?.chain).toMatch(/\.neq\(\s*["']status["'],\s*["']cancelled["']\s*\)/);
  });

  it("keeps the payroll-attached allowance true in the ledger", () => {
    // ATTACHED_TO_PAYROLL only buys a read a pass while no write can cancel a
    // commission already tied to a payroll run. Two facts make that true, and
    // both are re-read from the SQL here rather than remembered: attaching flips
    // the row to 'paid', and every write that sets 'cancelled' reaches only
    // unattached rows (`payroll_id IS NULL`) or still-pending rows.
    const dir = join(REPO_ROOT, "supabase", "migrations");
    const blocks = (pick: (body: string) => boolean) =>
      readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .flatMap((f) => {
          const src = readFileSync(join(dir, f), "utf8");
          const re = /update\s+public\.doctor_commissions[^;]+;/gis;
          const hits: string[] = [];
          let match: RegExpExecArray | null;
          while ((match = re.exec(src))) {
            if (pick(match[0])) hits.push(`${f}: ${match[0].replace(/\s+/g, " ")}`);
          }
          return hits;
        });
    const cancelling = blocks((b) => /status\s*=\s*'cancelled'/i.test(b));
    // void_invoice_financials() as defined in 20260923193000 (fingerprint-pinned
    // by 20261009141012), its two earlier copies, and the invoice-cancel trigger.
    // void_invoice_financials() in its three successive definitions, plus the
    // three trigger-era copies of the pending-only cancel. Migrations are
    // append-only history, so a new cancelling write lifts this number and
    // forces its guard to be read, not assumed.
    expect(cancelling.length).toBe(6);
    for (const block of cancelling) expect(block).toMatch(/payroll_id is null|status\s*=\s*'pending'/i);
    const attaching = blocks((b) => /payroll_id\s*=\s*new\.id/i.test(b));
    expect(attaching.length).toBeGreaterThan(0);
    for (const block of attaching) expect(block).toMatch(/status\s*=\s*'paid'/i);
  });

  it("keeps a cancelled booking out of the portal approval surfaces", () => {
    // Cancel from the queue flips `status` and leaves the portal hold `pending`,
    // and confirm_public_booking checks the hold but never the status before it
    // writes status='confirmed' (20260827091000:169 and :257) — so approving a
    // listed row brought a dead visit back, reminders included. The list and the
    // badge that counts it must both read only bookings that are still alive.
    for (const rel of ["pages/appointments/PendingBookings.tsx", "components/layout/Sidebar.tsx"]) {
      const src = readFileSync(join(SRC_ROOT, rel), "utf8");
      const at = src.indexOf('"booking_request_status", "pending"');
      expect(at, rel).toBeGreaterThan(-1);
      expect(src.slice(at, at + 600), rel).toMatch(/\.neq\(\s*"status",\s*"cancelled"\s*\)/);
    }
  });

  it("keeps the treasury desk netting payment reversals", () => {
    // Batch 2 replaced three hand-rolled pairings that only understood
    // expense_reversal; the desk must go through the shared helper.
    for (const rel of ["pages/treasury/Treasury.tsx", "pages/dashboard/Dashboard.tsx"]) {
      const src = readFileSync(join(SRC_ROOT, rel), "utf8");
      expect(src).toContain('from "@/lib/treasuryVisibility"');
      expect(src).toMatch(/dropReversedPairs\(/);
      expect(src).not.toMatch(/reference_type === "expense_reversal"/);
    }
  });
});
