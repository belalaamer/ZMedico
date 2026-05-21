import { forwardRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { toLatinDigits } from "@/lib/format";

type Props = Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: number | string;
  onChange: (v: number) => void;
  allowDecimal?: boolean;
};

/**
 * Numeric input that accepts Arabic-Indic (٠-٩) and Persian (۰-۹) digits in
 * addition to Latin digits. Uses text mode + inputMode="decimal" so RTL
 * keyboards work, then converts/parses to a plain number for the parent.
 */
export const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  { value, onChange, allowDecimal = true, onBlur, ...rest },
  ref,
) {
  const [text, setText] = useState<string>(() => (value === 0 || value === "0" ? "0" : String(value ?? "")));

  // Keep local text in sync when external value changes meaningfully
  useEffect(() => {
    const parsed = Number(toLatinDigits(text).replace(",", "."));
    if (!Number.isFinite(parsed) || parsed !== Number(value)) {
      setText(value === 0 || value === "0" ? "0" : String(value ?? ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      ref={ref}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      dir="ltr"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        const latin = toLatinDigits(raw).replace(",", ".");
        // Allow only digits and a single dot (if decimals allowed)
        const cleaned = allowDecimal
          ? latin.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
          : latin.replace(/[^0-9]/g, "");
        setText(cleaned);
        const n = Number(cleaned);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      onBlur={(e) => {
        if (text === "" || text === "." ) {
          setText("0");
          onChange(0);
        }
        onBlur?.(e);
      }}
      {...rest}
    />
  );
});