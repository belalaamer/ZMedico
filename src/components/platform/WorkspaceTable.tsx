import { Archive, Building2, CalendarClock, Ellipsis, Globe2, Palette, RotateCcw, SearchX, Settings2, ShieldAlert, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { localizedTenantName } from "@/lib/tenantName";
import type { Workspace, WorkspaceView } from "@/lib/platformWorkspaces";
import { ActionButton, EmptyState, Ident, Notice, StatusChip, type SignalTone } from "@/components/platform/PlatformSurface";
import { daysLeftLabel, daysUntil, platformDate, subscriptionLabel, usePlatformCopy } from "@/components/platform/platformCopy";

export type BranchTally = { total: number; active: number };

export type WorkspaceActions = {
  open: (workspace: Workspace) => void;
  health: (workspace: Workspace) => void;
  modules: (workspace: Workspace) => void;
  planTerm: (workspace: Workspace) => void;
  domains: (workspace: Workspace) => void;
  branding: (workspace: Workspace) => void;
  archive: (workspace: Workspace) => void;
  restore: (workspace: Workspace) => void;
  remove: (workspace: Workspace) => void;
};

const REVIEW_WINDOW_DAYS = 7;

// Declared through cn() so the design gate reads them: a bare string constant handed to
// className would be invisible to the scanner.
const cellClass = cn("px-z3 py-[10px] align-middle text-z-small rtl:text-z-small-ar");
const headClass = cn(
  "h-z9 px-z3 text-start align-middle text-z-micro rtl:text-z-micro-ar font-medium text-z-ink-500",
);
const menuContentClass = cn(
  "z-platform min-w-[14rem] rounded-z3 border-z-line-edge bg-z-raised p-z1 text-z-ink-700 shadow-z2",
);
const menuItemClass = cn(
  "gap-z2 rounded-z2 px-z2 py-z2 text-z-small rtl:text-z-small-ar transition-colors duration-zquick ease-z-out",
  "focus:bg-z-sunk focus:text-z-ink-900 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-z-ink-500",
);
const menuDangerClass = cn(
  "text-z-critical-ink focus:bg-z-critical-fill focus:text-z-critical-ink [&_svg]:text-z-critical-ink",
);

function toneOf(workspace: Workspace): SignalTone {
  if (workspace.is_archived || !workspace.is_active) return "neutral";
  if (workspace.subscription_status === "past_due") return "critical";
  if (workspace.subscription_status === "active") return "positive";
  return "neutral";
}

/**
 * The ledger. Fixed tracks so a column never jumps between pages, one action weight per row
 * (the primary verb plus an overflow menu), figures right-aligned in the reading direction,
 * and loading / empty / failed as three different designed states — a failed read must never
 * be mistaken for an empty list.
 */
export function WorkspaceTable({
  rows,
  view,
  branches,
  actions,
  loading,
  failed,
  onRetry,
  filtered,
  onClearFilters,
  onAddClinic,
  lifecycleReady,
}: {
  rows: Workspace[];
  view: WorkspaceView;
  branches: Map<string, BranchTally>;
  actions: WorkspaceActions;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  filtered: boolean;
  onClearFilters: () => void;
  onAddClinic: () => void;
  lifecycleReady: boolean;
}) {
  const { tx, isAr, lang } = usePlatformCopy();
  const archived = view === "archived";

  if (failed) {
    return (
      <div className="p-z4">
        <Notice
          tone="critical"
          title={tx("loadErrorTitle")}
          action={<ActionButton tone="quiet" size="sm" onClick={onRetry}>{tx("retry")}</ActionButton>}
        >
          {tx("loadErrorBody")}
        </Notice>
      </div>
    );
  }

  if (loading) return <SkeletonRows archived={archived} label={tx("loading")} />;

  if (rows.length === 0) {
    if (archived) {
      return <EmptyState icon={<Archive />} title={tx("emptyArchivedTitle")} body={tx("emptyArchivedBody")} />;
    }
    if (filtered) {
      return (
        <EmptyState
          icon={<SearchX />}
          title={tx("emptyFilteredTitle")}
          body={tx("emptyFilteredBody")}
          action={<ActionButton tone="quiet" size="sm" onClick={onClearFilters}>{tx("emptyFilteredAction")}</ActionButton>}
        />
      );
    }
    return (
      <EmptyState
        icon={<Building2 />}
        title={tx("emptyLiveTitle")}
        body={tx("emptyLiveBody")}
        action={<ActionButton size="sm" onClick={onAddClinic}>{tx("addClinic")}</ActionButton>}
      />
    );
  }

  return (
    <Table className="min-w-[46rem] table-fixed">
      <colgroup>
        {archived ? (
          <>
            <col className="w-[30%]" />
            <col className="w-[16%]" />
            <col className="w-[26%]" />
            <col className="w-[10%]" />
            <col className="w-[18%]" />
          </>
        ) : (
          <>
            <col className="w-[32%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
          </>
        )}
      </colgroup>
      <TableHeader className="bg-z-sunk [&_tr]:border-z-line-edge">
        <TableRow className="hover:bg-transparent">
          <TableHead className={headClass}>{tx("colWorkspace")}</TableHead>
          {archived ? (
            <>
              <TableHead className={headClass}>{tx("colArchivedOn")}</TableHead>
              <TableHead className={headClass}>{tx("colArchiveReason")}</TableHead>
            </>
          ) : (
            <>
              <TableHead className={headClass}>{tx("colPlan")}</TableHead>
              <TableHead className={headClass}>{tx("colStatus")}</TableHead>
            </>
          )}
          <TableHead className={cn(headClass, "text-end")}>{tx("colBranches")}</TableHead>
          {archived ? null : <TableHead className={cn(headClass, "text-end")}>{tx("colTerm")}</TableHead>}
          <TableHead className={cn(headClass, "text-end")}>
            <span className="sr-only">{tx("colActions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((workspace) => {
          const tally = branches.get(workspace.id) ?? { total: 0, active: 0 };
          const name = localizedTenantName(workspace, lang);
          const term = workspace.subscription_ends_at ?? workspace.trial_ends_at;
          const days = term ? daysUntil(term) : null;
          return (
            <TableRow
              key={workspace.id}
              className="border-z-line-hairline transition-colors duration-zquick ease-z-out hover:bg-z-brand-050"
            >
              <TableCell className={cellClass}>
                <div className="min-w-0">
                  <div className="truncate font-medium text-z-ink-900" title={name}>{name}</div>
                  <Ident className="mt-z1 block truncate">{workspace.slug}</Ident>
                </div>
              </TableCell>
              {archived ? (
                <>
                  <TableCell className={cn(cellClass, "z-num text-end text-z-ink-700")}>
                    <span dir="ltr" translate="no">{platformDate(workspace.archived_at, isAr)}</span>
                  </TableCell>
                  <TableCell className={cn(cellClass, "text-z-ink-500")}>
                    <span className="line-clamp-2">{workspace.archive_reason?.trim() || tx("noArchiveReason")}</span>
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell className={cn(cellClass, "text-z-ink-700")}>
                    <span className="block truncate">
                      {workspace.subscription_plans
                        ? isAr ? workspace.subscription_plans.name_ar : workspace.subscription_plans.name_en
                        : tx("noPlan")}
                    </span>
                  </TableCell>
                  <TableCell className={cellClass}>
                    <StatusChip tone={toneOf(workspace)}>
                      {workspace.is_archived
                        ? tx("archivedBadge")
                        : workspace.is_active
                          ? subscriptionLabel(workspace.subscription_status, isAr)
                          : tx("inactiveBadge")}
                    </StatusChip>
                  </TableCell>
                </>
              )}
              <TableCell className={cn(cellClass, "z-num text-end", tally.total === 0 ? "text-z-ink-400" : "text-z-ink-900")}>
                {tally.total}
              </TableCell>
              {archived ? null : (
                <TableCell className={cn(cellClass, "text-end")}>
                  {term ? (
                    <div className="min-w-0">
                      <div className="z-num truncate text-z-ink-700" dir="ltr" translate="no">
                        {platformDate(term, isAr)}
                      </div>
                      {days !== null && days <= REVIEW_WINDOW_DAYS ? (
                        <div
                          className={cn(
                            "z-num mt-z1 truncate text-z-micro rtl:text-z-micro-ar",
                            days < 0 ? "text-z-critical-ink" : "text-z-caution-ink",
                          )}
                        >
                          {days < 0 ? tx("termEnded") : daysLeftLabel(days, isAr)}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-z-ink-400">{tx("noTerm")}</span>
                  )}
                </TableCell>
              )}
              <TableCell className={cn(cellClass, "text-end")}>
                <div className="flex items-center justify-end gap-z2">
                  {archived ? (
                    <ActionButton
                      size="sm"
                      onClick={() => actions.restore(workspace)}
                      disabled={tally.total === 0}
                      title={tally.total === 0 ? tx("restoreNoBranches") : undefined}
                    >
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      {tx("restore")}
                    </ActionButton>
                  ) : (
                    <ActionButton
                      size="sm"
                      onClick={() => actions.open(workspace)}
                      disabled={tally.active === 0}
                      title={tally.active === 0 ? tx("noActiveBranchTitle") : undefined}
                    >
                      {tx("openWorkspace")}
                    </ActionButton>
                  )}
                  <RowMenu
                    workspace={workspace}
                    archived={archived}
                    actions={actions}
                    lifecycleReady={lifecycleReady}
                  />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function RowMenu({
  workspace,
  archived,
  actions,
  lifecycleReady,
}: {
  workspace: Workspace;
  archived: boolean;
  actions: WorkspaceActions;
  lifecycleReady: boolean;
}) {
  const { tx } = usePlatformCopy();
  const run = (action: (workspace: Workspace) => void) => () => action(workspace);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ActionButton tone="quiet" size="icon" className="h-8 w-8 shrink-0" aria-label={tx("moreActions")}>
          <Ellipsis className="size-4" aria-hidden="true" />
        </ActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={menuContentClass}>
        <DropdownMenuItem className={menuItemClass} onSelect={run(actions.health)}>
          <ShieldAlert aria-hidden="true" />
          {tx("health")}
        </DropdownMenuItem>
        {archived ? null : (
          <>
            <DropdownMenuItem className={menuItemClass} onSelect={run(actions.modules)}>
              <Settings2 aria-hidden="true" />
              {tx("modules")}
            </DropdownMenuItem>
            <DropdownMenuItem className={menuItemClass} onSelect={run(actions.planTerm)}>
              <CalendarClock aria-hidden="true" />
              {tx("planTerm")}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem className={menuItemClass} onSelect={run(actions.domains)}>
          <Globe2 aria-hidden="true" />
          {tx("domains")}
        </DropdownMenuItem>
        <DropdownMenuItem className={menuItemClass} onSelect={run(actions.branding)}>
          <Palette aria-hidden="true" />
          {tx("branding")}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-z-line-hairline" />
        {archived ? null : (
          <DropdownMenuItem className={cn(menuItemClass, menuDangerClass)} onSelect={run(actions.archive)}>
            <Archive aria-hidden="true" />
            {tx("archive")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className={cn(menuItemClass, menuDangerClass)}
          disabled={!lifecycleReady}
          title={lifecycleReady ? undefined : tx("schemaPendingTitle")}
          onSelect={run(actions.remove)}
        >
          <Trash2 aria-hidden="true" />
          {tx("permanentDelete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Loading geometry matches the real rows: same tracks, same two-line name cell. */
function SkeletonRows({ archived, label }: { archived: boolean; label: string }) {
  const columns = archived ? 5 : 6;
  return (
    <>
      <span className="sr-only" role="status">{label}</span>
      <Table className="min-w-[46rem] table-fixed" aria-hidden="true">
        <TableHeader className="bg-z-sunk [&_tr]:border-z-line-edge">
          <TableRow className="hover:bg-transparent">
            {Array.from({ length: columns }, (_, index) => (
              <TableHead key={index} className={headClass}>
                <span className="block h-z3 w-[60%] animate-pulse rounded-z1 bg-z-line-hairline" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 6 }, (_, row) => (
            <TableRow key={row} className="border-z-line-hairline hover:bg-transparent">
              {Array.from({ length: columns }, (_, column) => (
                <TableCell key={column} className={cellClass}>
                  {column === 0 ? (
                    <div className="space-y-z2">
                      <span className="block h-z4 w-[70%] animate-pulse rounded-z1 bg-z-sunk" />
                      <span className="block h-z3 w-[40%] animate-pulse rounded-z1 bg-z-sunk" />
                    </div>
                  ) : (
                    <span
                      className={cn(
                        "block h-z4 animate-pulse rounded-z1 bg-z-sunk",
                        column === columns - 1 ? "ms-auto w-[80%]" : "w-[55%]",
                      )}
                    />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
