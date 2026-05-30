import * as React from "react";

import { cn } from "@/lib/utils";

const toLatinDigits = (s: string) =>
  s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, value, onChange, placeholder, ...props }, ref) => {
    const isNumber = type === "number";
    const isZero = value === 0 || value === "0";
    const displayValue = isNumber && isZero ? "" : value;
    const displayPlaceholder =
      isNumber && (placeholder === undefined || placeholder === null || placeholder === "")
        ? "0"
        : placeholder;

    const handleChange = onChange
      ? (e: React.ChangeEvent<HTMLInputElement>) => {
          const converted = toLatinDigits(e.target.value);
          if (converted !== e.target.value) {
            e.target.value = converted;
          }
          onChange(e);
        }
      : undefined;

    return (
      <input
        type={type}
        value={displayValue as React.ComponentProps<"input">["value"]}
        onChange={handleChange}
        placeholder={displayPlaceholder}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
