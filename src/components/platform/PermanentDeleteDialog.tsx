import { useCallback, useEffect, useState } from "react";
import { Archive, Globe, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { deskFailure, type DeskFailureCopy } from "@/lib/deskFailure";
import { localizedTenantName } from "@/lib/tenantName";
import {
  assessWorkspaceDelete,
  permanentlyDeleteWorkspace,
  slugConfirmed,
  type DeleteAssessment,
  type DeleteReceipt,
  type Workspace,
} from "@/lib/platformWorkspaces";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ActionButton,
  FieldLabel,
  Ident,
  Notice,
  PlatformDialog,
  PlatformInput,
  SubjectLine,
} from "@/components/platform/PlatformSurface";
import { platformText, rowCountLabel, usePlatformCopy } from "@/components/platform/platformCopy";
import { blockerActionLabel, blockerReason, tableLabel } from "@/components/platform/tableLabels";

const REASON_LIMIT = 500;

const ledgerClass = cn("divide-y divide-z-line-hairline rounded-z2 border border-z-line-edge");
const ledgerRowClass = cn("flex flex-wrap items-baseline justify-between gap-x-z3 gap-y-z1 px-z3 py-z2");
const countClass = cn("z-num shrink-0 text-z-small rtl:text-z-small-ar text-z-ink-700");

type LedgerRow = { table: string; rows: number | null };

/**
 * The engine names relations, the operator reads nouns. Both are shown: the Arabic name is
 * what the decision is about, the identifier underneath is what the database will touch.
 */
function LedgerList({ title, rows, isAr }: { title: string; rows: LedgerRow[]; isAr: boolean }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-z2">
      <FieldLabel>{title}</FieldLabel>
      <ul className={ledgerClass}>
        {rows.map((row) => (
          <li key={row.table} className={ledgerRowClass}>
            <span className="min-w-0">
              <span className="block text-z-small rtl:text-z-small-ar text-z-ink-900">
                {tableLabel(row.table, isAr) ?? row.table}
              </span>
              <Ident className="block">{row.table}</Ident>
            </span>
            <span className={countClass}>
              {row.rows === null ? platformText("deleteBlockerUnknownRows", isAr) : rowCountLabel(row.rows, isAr)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Deletion is decided by the database, not by this dialog. The assessment walks the foreign
 * key graph, measures what belongs to the workspace and returns a verdict; the dialog only
 * renders it and refuses to offer the button the server would refuse. A blocker is a
 * measured fact with a named action, so "cannot delete" always comes with a way forward.
 */
export function PermanentDeleteDialog({
  workspace,
  open,
  onOpenChange,
  onDeleted,
  onArchive,
  onOpenDomains,
}: {
  workspace: Workspace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void | Promise<void>;
  onArchive: (workspace: Workspace) => void;
  onOpenDomains: (workspace: Workspace) => void;
}) {
  const { tx, lang, isAr } = usePlatformCopy();
  const { toast } = useToast();
  const [assessment, setAssessment] = useState<DeleteAssessment | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [assessFailure, setAssessFailure] = useState<DeskFailureCopy | null>(null);
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DeskFailureCopy | null>(null);
  const [receipt, setReceipt] = useState<DeleteReceipt | null>(null);

  const tenantId = workspace?.id ?? null;

  const assess = useCallback(async () => {
    if (!tenantId) return;
    setAssessing(true);
    setAssessFailure(null);
    const { assessment: result, error } = await assessWorkspaceDelete(tenantId);
    setAssessing(false);
    if (error || !result) {
      setAssessFailure(deskFailure(error, lang, platformText("deleteAssessFailed", lang === "ar")));
      return;
    }
    setAssessment(result);
  }, [tenantId, lang]);

  useEffect(() => {
    setConfirm("");
    setReason("");
    setFailure(null);
    setReceipt(null);
    setAssessment(null);
    setAssessFailure(null);
    if (open && tenantId) void assess();
  }, [open, tenantId, assess]);

  const confirmValue = assessment?.confirm_value || workspace?.slug || "";
  const matches = slugConfirmed(confirm, confirmValue);
  const deletable = assessment?.verdict === "DELETABLE" && !assessment.walk_stopped;
  const ready = deletable && matches && !busy;
  const domainBlocker = assessment?.blockers.some((blocker) => blocker.action === "domains") ?? false;

  const submit = async () => {
    if (!tenantId || !ready) return;
    setBusy(true);
    setFailure(null);
    const { receipt: result, error } = await permanentlyDeleteWorkspace({
      tenantId,
      confirmSlug: confirm,
      reason: reason.trim(),
    });
    setBusy(false);
    if (error || !result?.deleted) {
      const message = error?.message ?? "";
      if (message.includes("PERMANENT_DELETE_SLUG_MISMATCH")) {
        setFailure({ title: tx("deleteFailed"), description: tx("deleteConfirmMismatch") });
      } else if (message.includes("PERMANENT_DELETE_ARCHIVE_FIRST")) {
        setFailure({ title: tx("deleteFailed"), description: tx("deleteNeedsArchive") });
      } else if (message.includes("PERMANENT_DELETE_DRIFT")) {
        setFailure({ title: tx("deleteFailed"), description: tx("deleteDrift") });
      } else if (message.includes("PERMANENT_DELETE_BLOCKED")) {
        setFailure({ title: tx("deleteBlockedTitle"), description: tx("deleteBlockedLead") });
        void assess();
      } else {
        setFailure(deskFailure(error, lang, tx("deleteFailed")));
      }
      return;
    }
    setReceipt(result);
    toast({ title: tx("deletedToast") });
    await onDeleted();
  };

  const footer = receipt ? (
    <ActionButton tone="quiet" onClick={() => onOpenChange(false)}>{tx("close")}</ActionButton>
  ) : (
    <>
      <ActionButton tone="quiet" onClick={() => onOpenChange(false)} disabled={busy}>
        {tx("cancel")}
      </ActionButton>
      {assessFailure ? (
        <ActionButton tone="quiet" onClick={() => void assess()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {tx("retry")}
        </ActionButton>
      ) : null}
      {assessment?.verdict === "NEEDS_ARCHIVE" && workspace ? (
        <ActionButton onClick={() => { onOpenChange(false); onArchive(workspace); }}>
          <Archive className="size-4" aria-hidden="true" />
          {tx("archiveFirst")}
        </ActionButton>
      ) : null}
      {assessment?.verdict === "BLOCKED" ? (
        <>
          {domainBlocker && workspace ? (
            <ActionButton tone="quiet" onClick={() => { onOpenChange(false); onOpenDomains(workspace); }}>
              <Globe className="size-4" aria-hidden="true" />
              {tx("deleteOpenDomains")}
            </ActionButton>
          ) : null}
          <ActionButton tone="quiet" onClick={() => void assess()} disabled={assessing}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {tx("deleteReassess")}
          </ActionButton>
        </>
      ) : null}
      {deletable ? (
        <ActionButton tone="danger" onClick={() => void submit()} disabled={!ready}>
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
          {busy ? tx("deleting") : tx("confirmDelete")}
        </ActionButton>
      ) : null}
    </>
  );

  return (
    <PlatformDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      wide
      dir={isAr ? "rtl" : "ltr"}
      icon={<Trash2 aria-hidden="true" />}
      title={receipt ? tx("deleteReceiptTitle") : tx("deleteTitle")}
      footer={footer}
    >
      {workspace ? <SubjectLine name={localizedTenantName(workspace, lang)} slug={workspace.slug} /> : null}

      {receipt ? (
        <>
          <div className="space-y-z2 rounded-z2 border border-z-line-edge bg-z-sunk px-z4 py-z3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-z3 gap-y-z1">
              <span className="text-z-label rtl:text-z-label-ar font-medium text-z-ink-700">{tx("deleteReceiptId")}</span>
              <Ident className="break-all text-z-ink-900">{receipt.receipt_id}</Ident>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-z3 gap-y-z1">
              <span className="text-z-small rtl:text-z-small-ar text-z-ink-700">{tx("deleteKeptChangeLog")}</span>
              <span className={countClass}>{receipt.change_log_rows_kept}</span>
            </div>
          </div>
          <LedgerList title={tx("deleteErasedTitle")} rows={receipt.erased} isAr={isAr} />
          <LedgerList title={tx("deleteSurvivorsTitle")} rows={receipt.survivors} isAr={isAr} />
        </>
      ) : assessing ? (
        <>
          <div className="space-y-z3" aria-hidden="true">
            <div className="h-z9 animate-pulse rounded-z2 bg-z-sunk" />
            <div className="h-z16 animate-pulse rounded-z2 bg-z-sunk" />
          </div>
          <p role="status" className="sr-only">{tx("deleteAssessing")}</p>
        </>
      ) : assessFailure ? (
        <Notice tone="critical" title={assessFailure.title}>{assessFailure.description}</Notice>
      ) : assessment ? (
        <>
          {failure ? <Notice tone="critical" title={failure.title}>{failure.description}</Notice> : null}

          {assessment.verdict === "NEEDS_ARCHIVE" ? (
            <Notice tone="caution" title={tx("archiveFirst")}>{tx("deleteNeedsArchive")}</Notice>
          ) : null}

          {assessment.verdict === "BLOCKED" ? (
            <Notice tone="critical" title={tx("deleteBlockedTitle")}>{tx("deleteBlockedLead")}</Notice>
          ) : null}

          {assessment.walk_stopped ? (
            <Notice tone="caution" title={tx("deleteBlockedTitle")}>{tx("deleteWalkStopped")}</Notice>
          ) : null}

          {assessment.blockers.length ? (
            <div className="space-y-z2">
              <FieldLabel>{tx("deleteBlockersTitle")}</FieldLabel>
              <ul className={ledgerClass}>
                {assessment.blockers.map((blocker) => {
                  const action = blockerActionLabel(blocker.action, isAr);
                  return (
                    <li key={`${blocker.table}-${blocker.code}`} className="space-y-z1 px-z3 py-z3">
                      <div className={ledgerRowClass}>
                        <span className="min-w-0 text-z-small rtl:text-z-small-ar font-medium text-z-ink-900">
                          {tableLabel(blocker.table, isAr) ?? blocker.table}
                        </span>
                        <span className={countClass}>
                          {blocker.rows === null ? tx("deleteBlockerUnknownRows") : rowCountLabel(blocker.rows, isAr)}
                        </span>
                      </div>
                      <Ident className="block">{blocker.table}</Ident>
                      <p className="text-z-small rtl:text-z-small-ar text-z-ink-700">
                        {blockerReason(blocker.code, blocker.table, blocker.rows, isAr)}
                      </p>
                      {action ? (
                        <p className="text-z-micro rtl:text-z-micro-ar font-medium text-z-caution-ink">{action}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {deletable ? (
            <>
              <Notice tone="caution" title={tx("deleteDeletableTitle")}>{tx("deleteDeletableLead")}</Notice>
              <LedgerList title={tx("deleteErasedTitle")} rows={assessment.erased} isAr={isAr} />
              <div className="space-y-z2">
                <LedgerList title={tx("deleteSurvivorsTitle")} rows={assessment.survivors} isAr={isAr} />
                <p className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{tx("deleteSurvivorsLead")}</p>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-z5 gap-y-z1 border-t border-z-line-hairline pt-z3 text-z-micro rtl:text-z-micro-ar text-z-ink-500">
                <span>
                  {tx("deleteWalk")} <span className="z-num text-z-ink-700">{assessment.tables_measured}</span>
                </span>
                <span>
                  {tx("deleteEdges")} <span className="z-num text-z-ink-700">{assessment.edges_walked}</span>
                </span>
              </div>

              <div className="space-y-z2">
                <FieldLabel htmlFor="delete-confirm">{tx("deleteConfirmLabel")}</FieldLabel>
                <PlatformInput
                  id="delete-confirm"
                  dir="ltr"
                  translate="no"
                  autoComplete="off"
                  spellCheck={false}
                  value={confirm}
                  disabled={busy}
                  aria-describedby="delete-confirm-hint"
                  onChange={(event) => setConfirm(event.target.value)}
                />
                <p
                  id="delete-confirm-hint"
                  className={cn(
                    "text-z-micro rtl:text-z-micro-ar",
                    confirm.length > 0 && !matches ? "text-z-caution-ink" : "text-z-ink-500",
                  )}
                >
                  {confirm.length > 0 && !matches ? tx("deleteConfirmMismatch") : tx("deleteIrreversible")}
                </p>
              </div>

              <div className="space-y-z2">
                <FieldLabel htmlFor="delete-reason">{tx("deleteReasonLabel")}</FieldLabel>
                <PlatformInput
                  id="delete-reason"
                  maxLength={REASON_LIMIT}
                  value={reason}
                  disabled={busy}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </PlatformDialog>
  );
}
