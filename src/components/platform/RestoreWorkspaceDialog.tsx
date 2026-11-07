import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { deskFailure, type DeskFailureCopy } from "@/lib/deskFailure";
import { localizedTenantName } from "@/lib/tenantName";
import {
  RESTORE_STATUSES,
  recordedActiveBranchIds,
  recordedSubscriptionStatus,
  restoreWorkspace,
  snapshotOf,
  type SubscriptionStatus,
  type Workspace,
  type WorkspaceBranch,
} from "@/lib/platformWorkspaces";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ActionButton,
  FieldLabel,
  Notice,
  PlatformDialog,
  PlatformInput,
  SelectField,
  SubjectLine,
} from "@/components/platform/PlatformSurface";
import { subscriptionLabel, usePlatformCopy } from "@/components/platform/platformCopy";

const REASON_LIMIT = 500;

const checkboxClass = cn(
  "rounded-z2 border-z-line-strong focus-visible:ring-z-brand-500",
  "data-[state=checked]:border-z-brand-700 data-[state=checked]:bg-z-brand-700 data-[state=checked]:text-z-raised",
);

/**
 * Restore replays what the archive recorded, and says so when nothing was recorded. The two
 * server refusals (RESTORE_BRANCH_SELECTION_REQUIRED, RESTORE_SUBSCRIPTION_STATUS_REQUIRED)
 * exist so the database never guesses a clinic's before-state; this dialog makes the operator
 * choose before the call rather than translating a refusal afterwards.
 */
export function RestoreWorkspaceDialog({
  workspace,
  branches,
  open,
  onOpenChange,
  onRestored,
}: {
  workspace: Workspace | null;
  branches: WorkspaceBranch[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => void | Promise<void>;
}) {
  const { tx, lang, isAr } = usePlatformCopy();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<SubscriptionStatus | "">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DeskFailureCopy | null>(null);

  const owned = useMemo(
    () => branches.filter((branch) => branch.tenant_id === workspace?.id),
    [branches, workspace?.id],
  );
  const hasSnapshot = workspace ? snapshotOf(workspace) !== null : false;

  useEffect(() => {
    if (!open || !workspace) return;
    const recorded = recordedActiveBranchIds(workspace, branches);
    const single = owned.length === 1 ? [owned[0].id] : [];
    setSelected(recorded.length ? recorded : single);
    setStatus(recordedSubscriptionStatus(workspace) ?? "");
    setReason("");
    setFailure(null);
    // The selection is seeded once per opening, from the snapshot and the branches as they
    // were when the dialog opened; a later refetch must not move the operator's checkboxes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace?.id]);

  const ready = owned.length > 0 && selected.length > 0 && status !== "";

  const toggle = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const submit = async () => {
    if (!workspace || !ready || busy) return;
    setBusy(true);
    setFailure(null);
    const { result, error } = await restoreWorkspace({
      tenantId: workspace.id,
      reason: reason.trim(),
      branchIds: selected,
      subscriptionStatus: status as SubscriptionStatus,
    });
    setBusy(false);
    if (error) {
      const message = error.message ?? "";
      if (message.includes("RESTORE_BRANCH_SELECTION_REQUIRED")) {
        setFailure({ title: tx("restoreFailed"), description: tx("restoreSelectionRequired") });
      } else if (message.includes("RESTORE_SUBSCRIPTION_STATUS_REQUIRED")) {
        setFailure({ title: tx("restoreFailed"), description: tx("restoreStatusRequired") });
      } else {
        setFailure(deskFailure(error, lang, tx("restoreFailed")));
      }
      return;
    }
    toast({ title: result?.already_active ? tx("restoreAlreadyActive") : tx("restoredToast") });
    onOpenChange(false);
    await onRestored();
  };

  return (
    <PlatformDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      dir={isAr ? "rtl" : "ltr"}
      icon={<RotateCcw aria-hidden="true" />}
      title={tx("restoreTitle")}
      footer={
        <>
          <ActionButton tone="quiet" onClick={() => onOpenChange(false)} disabled={busy}>
            {tx("cancel")}
          </ActionButton>
          <ActionButton onClick={() => void submit()} disabled={!ready || busy}>
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? tx("restoring") : tx("confirmRestore")}
          </ActionButton>
        </>
      }
    >
      {workspace ? (
        <SubjectLine name={localizedTenantName(workspace, lang)} slug={workspace.slug} />
      ) : null}

      <p className="text-z-small rtl:text-z-small-ar text-z-ink-700">{tx("restoreLead")}</p>

      {hasSnapshot ? null : (
        <Notice tone="caution" title={tx("restoreNoSnapshotTitle")}>{tx("restoreNoSnapshot")}</Notice>
      )}
      {owned.length === 0 ? (
        <Notice tone="caution" title={tx("restoreNoBranchesTitle")}>{tx("restoreNoBranches")}</Notice>
      ) : null}
      {failure ? <Notice tone="critical" title={failure.title}>{failure.description}</Notice> : null}

      {owned.length > 0 ? (
        <div className="space-y-z2">
          <FieldLabel>{tx("restoreBranches")}</FieldLabel>
          <p className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{tx("restoreBranchHint")}</p>
          <ul className="divide-y divide-z-line-hairline rounded-z2 border border-z-line-edge">
            {owned.map((branch) => (
              <li key={branch.id}>
                <label className="flex cursor-pointer items-center gap-z3 px-z3 py-z2 transition-colors duration-zquick ease-z-out hover:bg-z-sunk">
                  <Checkbox
                    className={checkboxClass}
                    checked={selected.includes(branch.id)}
                    onCheckedChange={() => toggle(branch.id)}
                    disabled={busy}
                    aria-label={isAr ? branch.name_ar : branch.name_en}
                  />
                  <span className="min-w-0 truncate text-z-small rtl:text-z-small-ar text-z-ink-900">
                    {isAr ? branch.name_ar || branch.name_en : branch.name_en || branch.name_ar}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {selected.length === 0 ? (
            <p className="text-z-micro rtl:text-z-micro-ar text-z-caution-ink">{tx("restoreSelectionRequired")}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-z2">
        <FieldLabel htmlFor="restore-status">{tx("restoreStatus")}</FieldLabel>
        <SelectField
          id="restore-status"
          value={status}
          disabled={busy}
          onChange={(event) => setStatus(event.target.value as SubscriptionStatus | "")}
        >
          <option value="" disabled>{tx("restoreStatusRequired")}</option>
          {RESTORE_STATUSES.map((value) => (
            <option key={value} value={value}>{subscriptionLabel(value, isAr)}</option>
          ))}
        </SelectField>
      </div>

      <div className="space-y-z2">
        <FieldLabel htmlFor="restore-reason">{tx("restoreReasonLabel")}</FieldLabel>
        <PlatformInput
          id="restore-reason"
          maxLength={REASON_LIMIT}
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </PlatformDialog>
  );
}
