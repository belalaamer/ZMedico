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

  const handleDelete = async () => {
    if (!onDelete) return;
    setBusy(true);
    try { await onDelete(); } finally { setBusy(false); setConfirm(false); }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
          <Button variant="ghost" size="icon" aria-label="actions">
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {canEdit && onEdit && (
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
          {canDelete && onDelete && (
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
              {deleteDescription ?? (lang === "ar"
                ? "هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء."
                : "Are you sure you want to delete this record? This action cannot be undone.")}
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