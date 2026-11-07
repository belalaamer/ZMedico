import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The shared Clinical Ink surface layer. The primitives were authored with the platform
 * console and live there; this module re-exports them so the desks consume one import path,
 * and adds the pieces the operational desks need that the console never did (page header,
 * toolbar strip, money cell, skeleton, count pill).
 *
 * Everything here is inside the zero-tolerance lint scope: no literal colour, no raw Tailwind
 * palette, no radius that is not by nesting depth, and logical utilities only.
 */
export * from "@/components/platform/PlatformSurface";

/** The head of a desk screen: a title, one lead sentence, and the page's own actions. */
export function PageHeader({
  title,
  lead,
  icon,
  actions,
  className,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-z4", className)}>
      <div className="min-w-0">
        {icon ? (
          <div className="inline-flex items-center gap-z2 text-z-small rtl:text-z-small-ar font-medium text-z-ink-500 [&_svg]:size-4">
            {icon}
          </div>
        ) : null}
        <h1 className="text-z-title rtl:text-z-title-ar font-semibold text-z-ink-900">{title}</h1>
        {lead ? <p className="mt-z2 max-w-[76ch] text-z-small rtl:text-z-small-ar text-z-ink-500">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-z2">{actions}</div> : null}
    </div>
  );
}

/** A filter/action strip that sits on a raised surface, separated from the body by a hairline. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-z2 border-b border-z-line-hairline px-z4 py-z3", className)}>
      {children}
    </div>
  );
}

/** A caption above a group of controls or rows. Cased normally; never tracked caps. */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("text-z-label rtl:text-z-label-ar font-semibold text-z-ink-700", className)}>{children}</div>
  );
}

/**
 * An amount or a figure. Tabular by construction, and direction-neutral so an Arabic
 * sentence cannot reshape the digits or flip the currency.
 */
export function Money({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span dir="ltr" translate="no" className={cn("z-num whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

/** A count that belongs to a tab or a filter: a pill, not a badge with a colour. */
export function CountPill({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "z-num inline-flex min-w-[1.5rem] items-center justify-center rounded-z1 px-z2 text-z-micro rtl:text-z-micro-ar font-medium",
        active ? "bg-z-brand-050 text-z-brand-900" : "bg-z-sunk text-z-ink-500",
      )}
    >
      {children}
    </span>
  );
}

/** Loading geometry shaped like the row it replaces, never a spinner over empty space. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-z1 bg-z-sunk", className)} />;
}

/**
 * A table wrapped in the panel treatment: hairline border, z3 radius, no shadow. The table
 * itself is the memorable element, so it gets the density and the ruled columns, not ornament.
 */
export function TableShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-z3 border border-z-line-edge bg-z-raised", className)}>
      {children}
    </div>
  );
}
