import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The platform surfaces are built from these five pieces instead of the stock card kit:
 * a panel is a hairline-bordered surface with no shadow, an identifier is direction-neutral
 * material, a status chip carries a word as well as a colour, and a floating layer is the
 * only thing in the console that gets elevation.
 */

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-z3 border border-z-line-edge bg-z-raised", className)} {...props} />;
}

export function Ident({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span dir="ltr" translate="no" className={cn("z-ident text-z-micro rtl:text-z-micro-ar text-z-ink-500", className)} {...props} />;
}

export type SignalTone = "positive" | "caution" | "critical" | "neutral";

const TONE_CLASS: Record<SignalTone, string> = {
  positive: "border-z-positive-stroke bg-z-positive-fill text-z-positive-ink",
  caution: "border-z-caution-stroke bg-z-caution-fill text-z-caution-ink",
  critical: "border-z-critical-stroke bg-z-critical-fill text-z-critical-ink",
  neutral: "border-z-neutral-stroke bg-z-neutral-fill text-z-neutral-ink",
};

export function StatusChip({ tone, children, className }: { tone: SignalTone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-z1 rounded-z1 border px-z2 py-[2px] text-z-micro rtl:text-z-micro-ar font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

type ActionTone = "primary" | "quiet" | "danger" | "ghost";

/**
 * `variant="ghost"` is the base on purpose: the stock default variant paints `bg-primary`,
 * which is the retired purple. Every tone then states its own hover foreground, so no
 * `hover:text-accent-foreground` from the primitive can leak into a token surface.
 */
export function ActionButton({
  tone = "primary",
  className,
  ...props
}: Omit<ButtonProps, "variant"> & { tone?: ActionTone }) {
  return (
    <Button
      {...props}
      variant="ghost"
      className={cn(
        "gap-z2 rounded-z2 text-z-small rtl:text-z-small-ar font-medium transition-colors duration-zquick ease-z-out",
        "focus-visible:ring-2 focus-visible:ring-z-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-z-raised",
        tone === "primary" && "bg-z-brand-700 text-z-raised hover:bg-z-brand-900 hover:text-z-raised",
        tone === "quiet" && "border border-z-line-edge bg-z-raised text-z-ink-700 hover:bg-z-sunk hover:text-z-ink-900",
        tone === "danger" && "bg-z-critical text-z-raised hover:bg-z-critical-ink hover:text-z-raised",
        tone === "ghost" && "text-z-ink-500 hover:bg-z-sunk hover:text-z-ink-900",
        className,
      )}
    />
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
  action,
  className,
}: {
  tone?: SignalTone;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "critical" ? "alert" : "status"}
      className={cn("rounded-z2 border border-s-2 px-z4 py-z3", TONE_CLASS[tone], className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-z3">
        <div className="min-w-0">
          <div className="text-z-small rtl:text-z-small-ar font-semibold">{title}</div>
          {children ? <div className="mt-z1 text-z-small rtl:text-z-small-ar opacity-90">{children}</div> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-z3 px-z6 py-z12 text-center">
      <div className="flex size-12 items-center justify-center rounded-z2 bg-z-sunk text-z-ink-500 [&_svg]:size-5">{icon}</div>
      <div className="text-z-subtitle rtl:text-z-subtitle-ar font-semibold text-z-ink-900">{title}</div>
      <p className="max-w-[46ch] text-z-small rtl:text-z-small-ar text-z-ink-500">{body}</p>
      {action}
    </div>
  );
}

/**
 * One place to restyle the stock dialog: token surface, z3 radius at every breakpoint
 * (the primitive sets `sm:rounded-lg`, which tailwind-merge keeps unless it is overridden
 * at the same breakpoint), logical header/footer alignment, and z2 elevation because a
 * dialog is the only layer in this console that floats above the page.
 */
export function PlatformDialog({
  open,
  onOpenChange,
  title,
  icon,
  children,
  footer,
  wide,
  busy,
  dir,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  busy?: boolean;
  dir: "rtl" | "ltr";
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && busy) return; onOpenChange(next); }}>
      <DialogContent
        dir={dir}
        className={cn(
          "z-platform gap-z5 rounded-z3 border-z-line-edge bg-z-raised p-z6 text-z-ink-700 shadow-z2 sm:rounded-z3",
          wide ? "max-w-3xl" : "max-w-xl",
        )}
      >
        <DialogHeader className="gap-z2 pe-z9 text-start sm:text-start">
          <DialogTitle className="flex items-center gap-z2 text-z-subtitle rtl:text-z-subtitle-ar font-semibold tracking-normal text-z-ink-900 [&_svg]:size-4 [&_svg]:text-z-ink-500">
            {icon}
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="min-w-0 space-y-z5">{children}</div>
        {footer ? (
          // DialogFooter separates with `sm:space-x-2`, which puts the gap on the wrong side in Arabic.
          <div className="flex flex-col-reverse gap-z2 sm:flex-row sm:justify-end">{footer}</div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-z-label rtl:text-z-label-ar font-medium text-z-ink-700">
      {children}
    </label>
  );
}

/** Which workspace the dialog is about: its name, and its slug as direction-neutral material. */
export function SubjectLine({ name, slug }: { name: string; slug: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-z3 gap-y-z1 border-b border-z-line-hairline pb-z3">
      <span className="min-w-0 text-z-subtitle rtl:text-z-subtitle-ar font-semibold text-z-ink-900">{name}</span>
      <Ident>{slug}</Ident>
    </div>
  );
}

export const fieldClass = cn(
  "rounded-z2 border-z-line-edge bg-z-raised text-z-small rtl:text-z-small-ar text-z-ink-900 placeholder:text-z-ink-400 focus-visible:ring-z-brand-500",
);

/**
 * Native controls, deliberately. The stock Input/Textarea carry `text-base md:text-sm`, and a
 * responsive font size cannot be overridden from a className at the same breakpoint without
 * restating every variant — the token type scale would lose at desktop width. A native field
 * also mirrors in RTL for free and keeps the platform's own focus ring.
 */
const controlClass = cn(
  fieldClass,
  "w-full border px-z3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

export function PlatformInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, "h-z9", className)} />;
}

export function PlatformTextarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(controlClass, "min-h-[5rem] py-z2", className)} />;
}

/**
 * The stock Radix select item indents with `pl-8 pr-2` and pins its check to `left-2`, so it
 * reads wrong in Arabic. Filters here are three to six options: a native control is the right
 * weight, mirrors for free, and opens without a portal.
 */
export function SelectField({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0">
      <select {...props} className={cn(controlClass, "h-z9 appearance-none pe-z8", className)}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-z2 top-1/2 size-4 -translate-y-1/2 text-z-ink-500"
      />
    </div>
  );
}
