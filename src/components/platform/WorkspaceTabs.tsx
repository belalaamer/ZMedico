import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { WorkspaceCounts, WorkspaceView } from "@/lib/platformWorkspaces";
import { usePlatformCopy } from "@/components/platform/platformCopy";

const ORDER: WorkspaceView[] = ["live", "archived"];

/**
 * A view switcher, not a pill kit: the selected tab is marked by a 2px brand rule on the
 * same hairline the toolbar sits on. Roving tabindex plus direction-aware arrow keys, so
 * the Arabic console moves right-to-left the way the reader does.
 */
export function WorkspaceTabs({
  view,
  counts,
  onChange,
  panelId,
}: {
  view: WorkspaceView;
  counts: WorkspaceCounts;
  onChange: (view: WorkspaceView) => void;
  panelId: string;
}) {
  const { tx, isAr } = usePlatformCopy();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const labels: Record<WorkspaceView, string> = { live: tx("tabLive"), archived: tx("tabArchived") };
  const totals: Record<WorkspaceView, number> = { live: counts.live, archived: counts.archived };

  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = isAr ? index - 1 : index + 1;
    else if (event.key === "ArrowLeft") next = isAr ? index + 1 : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ORDER.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = (next + ORDER.length) % ORDER.length;
    onChange(ORDER[target]);
    refs.current[target]?.focus();
  };

  return (
    <div role="tablist" aria-label={tx("title")} className="flex items-center gap-z5">
      {ORDER.map((item, index) => {
        const selected = item === view;
        return (
          <button
            key={item}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="tab"
            id={`workspace-tab-${item}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              "-mb-px flex items-center gap-z2 border-b-2 border-transparent px-z1 py-z3 text-z-small rtl:text-z-small-ar font-medium",
              "transition-colors duration-zquick ease-z-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-z-brand-500",
              selected ? "border-z-brand-500 text-z-ink-900" : "text-z-ink-500 hover:text-z-ink-700",
            )}
          >
            {labels[item]}
            <span className={cn("z-num text-z-micro rtl:text-z-micro-ar", selected ? "text-z-ink-700" : "text-z-ink-400")}>
              {totals[item]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
