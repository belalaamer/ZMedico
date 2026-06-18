import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle2, AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { cn } from "@/lib/utils";

type Status = "pass" | "warning" | "fail";
type Check = {
  id: string;
  category: string;
  title: string;
  status: Status;
  severity: string;
  reason: string;
  action: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  security_context: "Security context",
  permissions: "Function permissions",
  branch_isolation: "Branch isolation",
  flow_integrity: "Flow integrity",
};
const CATEGORY_ORDER = ["security_context", "permissions", "branch_isolation", "flow_integrity"];

function normalizeStatus(s: string): Status {
  if (s === "fail") return "fail";
  if (s === "warning" || s === "warn") return "warning";
  return "pass";
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "fail") return <AlertCircle className="size-4 text-destructive" />;
  if (status === "warning") return <AlertTriangle className="size-4 text-yellow-600" />;
  return <CheckCircle2 className="size-4 text-emerald-600" />;
}
function StatusBadge({ status }: { status: Status }) {
  if (status === "fail") return <Badge variant="destructive" className="uppercase text-[10px]">Fail</Badge>;
  if (status === "warning") return <Badge className="uppercase text-[10px] bg-yellow-500 hover:bg-yellow-500/90 text-white">Warn</Badge>;
  return <Badge className="uppercase text-[10px] bg-emerald-600 hover:bg-emerald-600/90 text-white">Pass</Badge>;
}

export default function ExpenseSelfAudit() {
  const { currentBranchId } = useBranch();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await (supabase as any).rpc("expense_treasury_self_audit", {
        _branch_id: currentBranchId ?? null,
      });
      if (error) throw error;
      const normalized: Check[] = (data ?? []).map((row: any) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        status: normalizeStatus(row.status),
        severity: row.severity,
        reason: row.reason,
        action: row.action ?? null,
      }));
      setChecks(normalized);
      setRanAt(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranchId]);

  const totals = useMemo(() => {
    const t = { pass: 0, warning: 0, fail: 0 };
    (checks ?? []).forEach((c) => { t[c.status]++; });
    return t;
  }, [checks]);

  const failures = (checks ?? []).filter((c) => c.status === "fail");

  const grouped = useMemo(() => {
    if (!checks) return [] as { category: string; items: Check[] }[];
    const map = new Map<string, Check[]>();
    for (const c of checks) {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    }
    const order = [...CATEGORY_ORDER, ...Array.from(map.keys()).filter((k) => !CATEGORY_ORDER.includes(k))];
    return order
      .filter((c) => map.has(c))
      .map((category) => ({
        category,
        items: (map.get(category) ?? []).sort((a, b) => {
          const o = { fail: 0, warning: 1, pass: 2 } as const;
          return o[a.status] - o[b.status];
        }),
      }));
  }, [checks]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="size-6 text-primary" />
            Expense & Treasury Self-Audit
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only verification of permissions, triggers, and reversal integrity for the expense flow.
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={loading}>
          <RefreshCw className={cn("size-4 mr-2", loading && "animate-spin")} />
          Run audit
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : !checks ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Running first audit…</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="py-4 flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" /><span className="font-medium">{totals.pass} pass</span></div>
              <div className="flex items-center gap-2"><AlertTriangle className="size-4 text-yellow-600" /><span className="font-medium">{totals.warning} warning</span></div>
              <div className="flex items-center gap-2"><AlertCircle className="size-4 text-destructive" /><span className="font-medium">{totals.fail} fail</span></div>
              <Separator orientation="vertical" className="h-5" />
              <span className="text-muted-foreground">
                Branch: {currentBranchId ? <code className="text-xs">{currentBranchId.slice(0, 8)}…</code> : "all"}
              </span>
              {ranAt && <span className="text-muted-foreground">Ran {new Date(ranAt).toLocaleString()}</span>}
            </CardContent>
          </Card>

          {failures.length > 0 && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-destructive">
                  <AlertCircle className="size-4" /> Failures ({failures.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {failures.map((c) => <CheckRow key={c.id} check={c} />)}
              </CardContent>
            </Card>
          )}

          {grouped.map(({ category, items }) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-base">{CATEGORY_LABEL[category] ?? category}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((c) => <CheckRow key={c.id} check={c} />)}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: Check }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border bg-card/50">
      <StatusIcon status={check.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{check.title}</span>
          <StatusBadge status={check.status} />
          {check.severity && check.severity !== "info" && check.status !== "pass" && (
            <Badge variant="outline" className="text-[10px] uppercase">{check.severity}</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{check.reason}</div>
        {check.action && check.status !== "pass" && (
          <div className="text-xs mt-1"><span className="font-medium">Next:</span> {check.action}</div>
        )}
      </div>
    </div>
  );
}