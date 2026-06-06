import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FabProps = {
  onClick?: () => void;
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  type?: "button" | "submit";
};

/**
 * Mobile-first Floating Action Button. Hidden on md+ screens so existing
 * top-of-page action buttons remain the primary affordance on desktop.
 */
export function Fab({ onClick, children, ariaLabel, className, type = "button" }: FabProps) {
  return (
    <Button
      type={type}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "md:hidden fixed end-4 fab-safe-bottom z-40 size-14 rounded-full shadow-elegant gradient-primary text-primary-foreground p-0 flex items-center justify-center",
        className,
      )}
    >
      {children}
    </Button>
  );
}