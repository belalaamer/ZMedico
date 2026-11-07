import { Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceCounts, WorkspaceStatusFilter, WorkspaceView } from "@/lib/platformWorkspaces";
import { usePlatformCopy } from "@/components/platform/platformCopy";

type Cell = {
  key: "live" | "active" | "needsReview" | "archived";
  value: number;
  view: WorkspaceView;
  status: WorkspaceStatusFilter;
  selected: boolean;
};

/**
 * One surface ruled into four figures, not four sibling cards. The hairlines come from a
 * 1px gap over a line-coloured ground, so the rules stay correct at 2-up and 4-up without
 * breakpoint-specific border arithmetic. Every figure is a measured head count and every
 * cell is the filter that produces exactly that count.
 */
export function WorkspaceKpis({
  counts,
  view,
  status,
  onSelect,
  loading,
}: {
  counts: WorkspaceCounts;
  view: WorkspaceView;
  status: WorkspaceStatusFilter;
  onSelect: (view: WorkspaceView, status: WorkspaceStatusFilter) => void;
  loading: boolean;
}) {
  const { tx } = usePlatformCopy();
  const live = view === "live";
  const cells: Cell[] = [
    { key: "live", value: counts.live, view: "live", status: "all", selected: live && status === "all" },
    { key: "active", value: counts.active, view: "live", status: "active", selected: live && status === "active" },
    { key: "needsReview", value: counts.needsReview, view: "live", status: "needs_review", selected: live && status === "needs_review" },
    { key: "archived", value: counts.archived, view: "archived", status: "all", selected: !live },
  ];
  const labels = {
    live: [tx("kpiLive"), tx("kpiLiveHint")],
    active: [tx("kpiActive"), tx("kpiActiveHint")],
    needsReview: [tx("kpiReview"), tx("kpiReviewHint")],
    archived: [tx("kpiArchived"), tx("kpiArchivedHint")],
  } as const;

  return (
    <div className="overflow-hidden rounded-z3 border border-z-line-edge bg-z-line-hairline">
      <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
        {cells.map((cell) => {
          const [label, hint] = labels[cell.key];
          return (
            <button
              key={cell.key}
              type="button"
              aria-pressed={cell.selected}
              onClick={() => onSelect(cell.view, cell.status)}
              className={cn(
                "relative flex flex-col items-start gap-z1 bg-z-raised px-z5 py-z4 text-start transition-colors duration-zquick ease-z-out",
                "hover:bg-z-brand-050 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-z-brand-500",
                cell.selected && "bg-z-brand-050",
              )}
            >
              <span className="flex items-center gap-z1 text-z-micro rtl:text-z-micro-ar font-medium text-z-ink-500">
                {cell.key === "archived" ? <Archive className="size-3.5" aria-hidden="true" /> : null}
                {label}
              </span>
              <span
                className={cn(
                  "z-num text-z-display rtl:text-z-display-ar font-semibold",
                  cell.key === "archived" ? "text-z-ink-500" : "text-z-ink-900",
                  loading && "text-z-ink-400",
                )}
              >
                {loading ? "—" : cell.value}
              </span>
              <span className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">{hint}</span>
              {cell.selected ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-z-brand-500" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
