import { useEffect, useState } from "react";
import { Archive, LoaderCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deskFailure, type DeskFailureCopy } from "@/lib/deskFailure";
import { localizedTenantName } from "@/lib/tenantName";
import { slugConfirmed, type Workspace } from "@/lib/platformWorkspaces";
import { useToast } from "@/hooks/use-toast";
import {
  ActionButton,
  FieldLabel,
  Notice,
  PlatformDialog,
  PlatformInput,
  PlatformTextarea,
  SubjectLine,
} from "@/components/platform/PlatformSurface";
import { usePlatformCopy } from "@/components/platform/platformCopy";

const REASON_LIMIT = 500;

/**
 * Archiving is reversible, so the gate is a typed slug rather than a scare: it proves the
 * operator knows which workspace they are closing. The reason is optional and is recorded
 * verbatim in the archive ledger, where the Archived tab shows it.
 */
export function ArchiveWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
  onArchived,
}: {
  workspace: Workspace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived: () => void | Promise<void>;
}) {
  const { tx, lang } = usePlatformCopy();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DeskFailureCopy | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setConfirmSlug("");
    setFailure(null);
  }, [open, workspace?.id]);

  const slug = workspace?.slug ?? "";
  const ready = slugConfirmed(confirmSlug, slug);

  const submit = async () => {
    if (!workspace || !ready || busy) return;
    setBusy(true);
    setFailure(null);
    const { error } = await supabase.rpc("platform_archive_tenant", {
      p_tenant_id: workspace.id,
      p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) {
      setFailure(deskFailure(error, lang, tx("archiveFailed")));
      return;
    }
    toast({ title: tx("archivedToast") });
    onOpenChange(false);
    await onArchived();
  };

  return (
    <PlatformDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      dir={lang === "ar" ? "rtl" : "ltr"}
      icon={<Archive aria-hidden="true" />}
      title={tx("archiveTitle")}
      footer={
        <>
          <ActionButton tone="quiet" onClick={() => onOpenChange(false)} disabled={busy}>
            {tx("cancel")}
          </ActionButton>
          <ActionButton tone="danger" onClick={() => void submit()} disabled={!ready || busy}>
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? tx("archiving") : tx("confirmArchive")}
          </ActionButton>
        </>
      }
    >
      {workspace ? (
        <SubjectLine name={localizedTenantName(workspace, lang)} slug={workspace.slug} />
      ) : null}

      <p className="text-z-small rtl:text-z-small-ar text-z-ink-700">{tx("archiveLead")}</p>
      <p className="text-z-small rtl:text-z-small-ar text-z-ink-500">{tx("archiveKeeps")}</p>

      {failure ? <Notice tone="critical" title={failure.title}>{failure.description}</Notice> : null}

      <div className="space-y-z2">
        <FieldLabel htmlFor="archive-reason">{tx("archiveReasonLabel")}</FieldLabel>
        <PlatformTextarea
          id="archive-reason"
          rows={3}
          maxLength={REASON_LIMIT}
          value={reason}
          placeholder={tx("archiveReasonPlaceholder")}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
        />
        <div className="z-num text-end text-z-micro rtl:text-z-micro-ar text-z-ink-400">
          <span dir="ltr" translate="no">{reason.length}/{REASON_LIMIT}</span>
        </div>
      </div>

      <div className="space-y-z2">
        <FieldLabel htmlFor="archive-confirm">{tx("confirmSlugLabel")}</FieldLabel>
        <PlatformInput
          id="archive-confirm"
          dir="ltr"
          translate="no"
          autoComplete="off"
          spellCheck={false}
          value={confirmSlug}
          placeholder={slug}
          onChange={(event) => setConfirmSlug(event.target.value)}
          disabled={busy}
        />
      </div>
    </PlatformDialog>
  );
}
