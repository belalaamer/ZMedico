import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
import { runQueueSelfAudit, type AuditReport, type AuditCheck, type AuditCategory } from "@/lib/queueSelfAudit";
import { ActionButton, Panel, SectionLabel, Skeleton, StatusChip, type SignalTone } from "@/components/zds/surface";
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

const STATUS_TONE: Record<AuditCheck["status"], SignalTone> = {
  pass: "positive",
  warning: "caution",
  fail: "critical",
};

const STATUS_ICON: Record<AuditCheck["status"], React.ReactNode> = {
  pass: <CheckCircle2 aria-hidden="true" />,
  warning: <AlertTriangle aria-hidden="true" />,
  fail: <AlertCircle aria-hidden="true" />,
};

const STATUS_ICON_CLASS: Record<AuditCheck["status"], string> = {
  pass: "text-z-positive-ink",
  warning: "text-z-caution-ink",
  fail: "text-z-critical-ink",
};

function StatusBadge({ status }: { status: AuditCheck["status"] }) {
  const label = status === "fail" ? "Fail" : status === "warning" ? "Warn" : "Pass";
  return <StatusChip tone={STATUS_TONE[status]}>{label}</StatusChip>;
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
    <div className="z-desk min-h-screen">
      <div className="mx-auto max-w-5xl space-y-z6 px-z4 py-z6 md:px-z6">
        {/* The selfAuditReachability contract reads the first h1 element in this file as the
            screen's own title, so it is written here rather than inside a shared header. */}
        <div className="flex flex-wrap items-end justify-between gap-z4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-z2 text-z-small rtl:text-z-small-ar font-medium text-z-ink-500 [&_svg]:size-4">
              <Activity aria-hidden="true" />
            </div>
            <h1 className="text-z-title rtl:text-z-title-ar font-semibold text-z-ink-900">Queue Self-Audit</h1>
            <p className="mt-z2 max-w-[76ch] text-z-small rtl:text-z-small-ar text-z-ink-500">Health, security and correctness of the alert subsystem for the current branch.</p>
          </div>
          <div className="flex flex-wrap items-center gap-z2">
            <ActionButton
              tone="quiet"
              onClick={() => setAuto((v) => !v)}
              className={cn(auto && "border-z-brand-500 text-z-brand-700")}
            >
              Auto refresh: {auto ? "on" : "off"}
            </ActionButton>
            <ActionButton onClick={() => void run()} disabled={loading || !branchSelectionReady || !currentBranchId}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden="true" />
              Run audit
            </ActionButton>
          </div>
        </div>

        {!branchSelectionReady || !currentBranchId ? (
          <Panel className="py-z8 text-center text-z-small rtl:text-z-small-ar text-z-ink-500">Select a branch to run the audit.</Panel>
        ) : !report ? (
          <Panel className="space-y-z3 p-z4">
            <Skeleton className="h-z5 w-1/3" />
            <Skeleton className="h-z4 w-2/3" />
            <Skeleton className="h-z4 w-1/2" />
          </Panel>
        ) : (
          <>
            <Panel className="flex flex-wrap items-center gap-z4 px-z4 py-z3">
              <div className="flex items-center gap-z2 text-z-small rtl:text-z-small-ar text-z-positive-ink">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                <span className="z-num font-medium">{report.totals.pass} pass</span>
              </div>
              <div className="flex items-center gap-z2 text-z-small rtl:text-z-small-ar text-z-caution-ink">
                <AlertTriangle className="size-4" aria-hidden="true" />
                <span className="z-num font-medium">{report.totals.warning} warning</span>
              </div>
              <div className="flex items-center gap-z2 text-z-small rtl:text-z-small-ar text-z-critical-ink">
                <AlertCircle className="size-4" aria-hidden="true" />
                <span className="z-num font-medium">{report.totals.fail} fail</span>
              </div>
              <span className="ms-auto z-num text-z-micro rtl:text-z-micro-ar text-z-ink-500">Ran {new Date(report.ranAt).toLocaleString()}</span>
            </Panel>

            {failures.length > 0 && (
              <Panel className="border-z-critical-stroke">
                <div className="border-b border-z-line-hairline px-z4 py-z3">
                  <div className="flex items-center gap-z2 text-z-small rtl:text-z-small-ar font-semibold text-z-critical-ink">
                    <AlertCircle className="size-4" aria-hidden="true" />
                    Failures ({failures.length})
                  </div>
                </div>
                <div className="space-y-z2 p-z4">
                  {failures.map((c) => <CheckRow key={c.id} check={c} />)}
                </div>
              </Panel>
            )}

            {grouped.map(({ category, items }) => (
              <Panel key={category}>
                <div className="border-b border-z-line-hairline px-z4 py-z3">
                  <SectionLabel>{CATEGORY_LABEL[category]}</SectionLabel>
                </div>
                <div className="space-y-z2 p-z4">
                  {items.map((c) => <CheckRow key={c.id} check={c} />)}
                </div>
              </Panel>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: AuditCheck }) {
  return (
    <div className="flex items-start gap-z3 rounded-z2 border border-z-line-edge bg-z-sunk p-z3">
      <span className={cn("mt-0.5 shrink-0 [&_svg]:size-4", STATUS_ICON_CLASS[check.status])}>{STATUS_ICON[check.status]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-z2">
          <span className="text-z-small rtl:text-z-small-ar font-medium text-z-ink-900">{check.title}</span>
          <StatusBadge status={check.status} />
          {check.severity !== "info" && check.status !== "pass" ? (
            <StatusChip tone="neutral">{check.severity}</StatusChip>
          ) : null}
        </div>
        <div className="mt-z1 text-z-micro rtl:text-z-micro-ar text-z-ink-500">{check.reason}</div>
        {check.action && check.status !== "pass" ? (
          <div className="mt-z1 text-z-micro rtl:text-z-micro-ar text-z-ink-700">
            <span className="font-medium">Next:</span> {check.action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
