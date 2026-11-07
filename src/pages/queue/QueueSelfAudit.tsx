import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle2, AlertTriangle, RefreshCw, Activity } from "lucide-react";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
import { runQueueSelfAudit, type AuditReport, type AuditCheck, type AuditCategory } from "@/lib/queueSelfAudit";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  access: "Branch access & RLS",
  lifecycle: "Alert lifecycle",
  detector: "Background detector",
  heartbeat: "Heartbeat",
  realtime: "Realtime sync",
  hours: "Business / quiet hours",
  consumer: "Dashboard consumer",
  integrity: "Data integrity",
};

const CATEGORY_ORDER: AuditCategory[] = [
  "access", "lifecycle", "integrity", "detector", "heartbeat", "realtime", "hours", "consumer",
];

function StatusIcon({ status }: { status: AuditCheck["status"] }) {
  if (status === "fail") return <AlertCircle className="size-4 text-destructive" />;
  if (status === "warning") return <AlertTriangle className="size-4 text-yellow-600" />;
  return <CheckCircle2 className="size-4 text-emerald-600" />;
}

function StatusBadge({ status }: { status: AuditCheck["status"] }) {
  if (status === "fail") return <Badge variant="destructive" className="uppercase text-[10px]">Fail</Badge>;
  if (status === "warning") return <Badge className="uppercase text-[10px] bg-yellow-500 hover:bg-yellow-500/90 text-white">Warn</Badge>;
  return <Badge className="uppercase text-[10px] bg-emerald-600 hover:bg-emerald-600/90 text-white">Pass</Badge>;
}

export default function QueueSelfAudit() {
  const { currentBranchId, branchSelectionReady } = useBranch();
  const { t } = useI18n();
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(false);

  async function run() {
    if (!branchSelectionReady || !currentBranchId) { setReport(null); return; }
    setLoading(true);
    try {
      const r = await runQueueSelfAudit(currentBranchId);
      setReport(r);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (branchSelectionReady && currentBranchId) void run();
    else setReport(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchSelectionReady, currentBranchId]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => { void run(); }, 5 * 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, branchSelectionReady, currentBranchId]);

  const grouped = useMemo(() => {
    if (!report) return [] as { category: AuditCategory; items: AuditCheck[] }[];
    const map = new Map<AuditCategory, AuditCheck[]>();
    for (const c of report.checks) {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    }
    return CATEGORY_ORDER
      .filter((c) => map.has(c))
      .map((category) => ({
        category,
        items: (map.get(category) ?? []).sort((a, b) => {
          const order = { fail: 0, warning: 1, pass: 2 } as const;
          return order[a.status] - order[b.status];
        }),
      }));
  }, [report]);

  const failures = report?.checks.filter((c) => c.status === "fail") ?? [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="size-6 text-primary" />
            Queue Self-Audit
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Health, security and correctness of the alert subsystem for the current branch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAuto((v) => !v)}
            className={cn(auto && "border-primary text-primary")}
          >
            Auto refresh: {auto ? "on" : "off"}
          </Button>
          <Button size="sm" onClick={() => void run()} disabled={loading || !branchSelectionReady || !currentBranchId}>
            <RefreshCw className={cn("size-4 mr-2", loading && "animate-spin")} />
            Run audit
          </Button>
        </div>
      </div>

      {!branchSelectionReady || !currentBranchId ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Select a branch to run the audit.</CardContent></Card>
      ) : !report ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Running first audit…</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="py-4 flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" /><span className="font-medium">{report.totals.pass} pass</span></div>
              <div className="flex items-center gap-2"><AlertTriangle className="size-4 text-yellow-600" /><span className="font-medium">{report.totals.warning} warning</span></div>
              <div className="flex items-center gap-2"><AlertCircle className="size-4 text-destructive" /><span className="font-medium">{report.totals.fail} fail</span></div>
              <Separator orientation="vertical" className="h-5" />
              <span className="text-muted-foreground">Ran {new Date(report.ranAt).toLocaleString()}</span>
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
                {failures.map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </CardContent>
            </Card>
          )}

          {grouped.map(({ category, items }) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-base">{CATEGORY_LABEL[category]}</CardTitle>
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

function CheckRow({ check }: { check: AuditCheck }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border bg-card/50">
      <StatusIcon status={check.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{check.title}</span>
          <StatusBadge status={check.status} />
          {check.severity !== "info" && check.status !== "pass" && (
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