import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

type Props = {
  page: number;                 // 0-based
  pageSize: number;
  total: number;                // total row count from count:"exact"
  onPageChange: (page: number) => void;
  className?: string;
};

/**
 * Lightweight server-side pager. Renders "M–N of TOTAL" plus prev/next
 * controls. Behaviour identical to previous inline pagination: renders
 * nothing when there is nothing to page through.
 */
export function TablePager({ page, pageSize, total, onPageChange, className }: Props) {
  const { lang } = useI18n();
  if (total <= pageSize) return null;
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 0;
  const canNext = page + 1 < pages;
  const of = lang === "ar" ? "من" : "of";
  return (
    <div className={`flex items-center justify-between gap-2 p-3 border-t border-border text-sm ${className ?? ""}`}>
      <div className="text-muted-foreground tabular-nums">
        {start}–{end} {of} {total}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-xs text-muted-foreground tabular-nums px-1">
          {page + 1} / {pages}
        </div>
        <Button variant="outline" size="sm" disabled={!canNext} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}