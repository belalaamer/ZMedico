import { supabase } from "@/integrations/supabase/client";

export type LineForCoverage = {
  item_type: "service" | "product" | "procedure";
  product_id?: string | null;
  line_total: number;
};

export type LineCoverage = {
  rule_id: string | null;
  covered_amount: number;
};

/**
 * Fetch the single active contract for an insurance company (most recent valid one).
 * Returns null if the company has no usable contract — caller should fall back to flat coverage.
 */
export async function fetchActiveContract(companyId: string) {
  if (!companyId) return null;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("insurance_contracts" as any)
    .select("id, name_en, name_ar, default_coverage_percent, valid_from, valid_to, is_active")
    .eq("insurance_company_id", companyId)
    .eq("is_active", true)
    .or(`valid_from.is.null,valid_from.lte.${today}`)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .order("valid_from", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}

/**
 * Resolve coverage for one line via the DB resolver.
 * Returns { rule_id, covered_amount }. When contractId is null returns zero coverage.
 */
export async function resolveLineCoverage(
  contractId: string | null,
  line: LineForCoverage,
): Promise<LineCoverage> {
  if (!contractId || !line.line_total || line.line_total <= 0) {
    return { rule_id: null, covered_amount: 0 };
  }
  const { data, error } = await (supabase as any).rpc("fn_resolve_coverage", {
    _contract_id: contractId,
    _item_type: line.item_type,
    _product_id: line.product_id ?? null,
    _line_total: line.line_total,
  });
  if (error || !data || !data.length) return { rule_id: null, covered_amount: 0 };
  const row = data[0];
  return {
    rule_id: row.rule_id ?? null,
    covered_amount: Number(row.covered_amount) || 0,
  };
}

/**
 * Resolve coverage for many lines in parallel.
 */
export async function resolveAllLines(
  contractId: string | null,
  lines: LineForCoverage[],
): Promise<LineCoverage[]> {
  if (!contractId) return lines.map(() => ({ rule_id: null, covered_amount: 0 }));
  return Promise.all(lines.map((l) => resolveLineCoverage(contractId, l)));
}

/**
 * Distribute a manually-set or flat-fallback claim total across lines proportionally
 * to each line's gross line_total, so that SUM(per-line covered) == claimTotal exactly.
 * Used when there is no contract, or when the user manually overrides the claim amount.
 */
export function distributeClaim(
  lineTotals: number[],
  claimTotal: number,
): number[] {
  const sum = lineTotals.reduce((a, b) => a + (b || 0), 0);
  if (sum <= 0 || claimTotal <= 0) return lineTotals.map(() => 0);
  const capped = Math.min(claimTotal, sum);
  const raw = lineTotals.map((lt) => +(((lt || 0) / sum) * capped).toFixed(2));
  // rounding correction on the last non-zero line
  const diff = +(capped - raw.reduce((a, b) => a + b, 0)).toFixed(2);
  if (diff !== 0) {
    for (let i = raw.length - 1; i >= 0; i--) {
      if (lineTotals[i] > 0) { raw[i] = +(raw[i] + diff).toFixed(2); break; }
    }
  }
  return raw;
}