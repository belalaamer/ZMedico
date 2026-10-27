import { MoreVertical, Pencil, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";

type Props = {
  onEdit?: () => void;
  onDelete?: () => Promise<void> | void;
  canEdit?: boolean;
  canDelete?: boolean;
  deleteTitle?: string;
  deleteDescription?: string;
  deleteLabel?: string;
  deleteConfirmLabel?: string;
  deleteAsCancel?: boolean;
  extraItems?: { label: string; icon?: ReactNode; onClick: () => void }[];
};

export function RowActions({
  onEdit, onDelete, canEdit = true, canDelete = true,
  deleteTitle, deleteDescription, deleteLabel, deleteConfirmLabel, deleteAsCancel, extraItems,
}: Props) {
  const { t, lang } = useI18n();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const showsEdit = Boolean(canEdit && onEdit);
  const showsExtra = Boolean(extraItems?.length);
  const showsDelete = Boolean(canDelete && onDelete);

  const handleDelete = async () => {
    if (!onDelete) return;
    setBusy(true);
    try { await onDelete(); } finally { setBusy(false); setConfirm(false); }
  };

  // Every action below is permission-gated, so a row whose rights hide all of them would
  // otherwise offer a kebab that opens an empty menu.
  if (!showsEdit && !showsExtra && !showsDelete) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
          <Button variant="ghost" size="icon" aria-label="actions">
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {showsEdit && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Pencil className="me-2 size-4" />{t("edit")}
            </DropdownMenuItem>
          )}
          {extraItems?.map((it, idx) => (
            <DropdownMenuItem key={idx} onClick={(e) => { e.stopPropagation(); it.onClick(); }}>
              {it.icon ? <span className="me-2 inline-flex items-center">{it.icon}</span> : null}
              {it.label}
            </DropdownMenuItem>
          ))}
          {showsDelete && (
            <DropdownMenuItem className="text-destructive focus:text-destructive"
              onClick={(e) => { e.stopPropagation(); setConfirm(true); }}>
              {deleteAsCancel ? <X className="me-2 size-4" /> : <Trash2 className="me-2 size-4" />}
              {deleteLabel ?? t("delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle ?? t("confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {/* A14: this said "cannot be undone" on 12 screens whose handlers all just set
                  deleted_at. Measured per consumer on main: no RowActions consumer issues a
                  `.delete()`; PurchaseOrders goes through delete_purchase_order_draft, whose
                  body is `update … set deleted_at = now()`. There is no restore screen yet
                  (C12), so the copy states what the app does instead of promising either end. */}
              {deleteDescription ?? (lang === "ar"
                ? "سيُخفى هذا السجل من القوائم — أي يُعلَّم كمحذوف في قاعدة البيانات ولا يُمحى منها."
                : "This record will be hidden from the lists — it is marked deleted in the database, not erased.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteConfirmLabel ?? deleteLabel ?? t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}