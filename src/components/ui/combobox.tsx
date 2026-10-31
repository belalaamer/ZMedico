import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Extra text included in fuzzy search (e.g. codes, phone numbers). */
  keywords?: string;
  /** Muted text after the label. Never searched; meant for server-side lists. */
  detail?: string;
};

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  /** Optional clearable behavior — emits "" when re-selecting the same value. */
  allowClear?: boolean;
  /**
   * Server-side mode. When present, cmdk's local filter is switched off and the
   * list is exactly what the caller last returned for `term`; every debounced
   * keystroke (and the empty term on open) is handed to this callback.
   */
  onSearch?: (term: string) => void;
  /** Debounce for `onSearch`, ms. Ignored without `onSearch`. */
  searchDelay?: number;
  /** True while an `onSearch` request is in flight: the list is held back. */
  searching?: boolean;
  /** Shown instead of `emptyText` while `searching`. */
  searchingText?: string;
  /** Muted line under the input, e.g. "keep typing" when a bounded page is full. */
  hintText?: string;
  /**
   * Label to echo for `value` when it is not in `options`. A server-side list is
   * one page of matches, so the chosen row routinely is not — and an empty picker
   * must not make a booked patient look unselected.
   */
  selectedLabel?: string | null;
}

/**
 * Searchable single-select dropdown. Drop-in replacement for plain `<Select>`
 * when the list contains many options (patients, doctors, products, etc).
 * Works well inside dialogs (clamps to viewport, won't overflow).
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  disabled,
  className,
  allowClear,
  onSearch,
  searchDelay = 250,
  searching,
  searchingText,
  hintText,
  selectedLabel,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const remote = typeof onSearch === "function";
  const [term, setTerm] = React.useState("");
  // Held in a ref so an inline `onSearch` from the caller cannot retrigger the
  // search effect on every render.
  const latestSearch = React.useRef(onSearch);
  React.useEffect(() => {
    latestSearch.current = onSearch;
  });

  React.useEffect(() => {
    if (!remote) return;
    // Opening the picker asks for the default page immediately; typing is debounced.
    if (!term) {
      latestSearch.current?.("");
      return;
    }
    const timer = window.setTimeout(() => latestSearch.current?.(term.trim()), searchDelay);
    return () => window.clearTimeout(timer);
  }, [remote, term, searchDelay]);

  const selected = React.useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );
  const echo = selectedLabel ?? selected?.label ?? null;
  // While a search is in flight the old page no longer matches the box, and
  // selecting from it would book whoever was there before the last keystroke.
  const visible = remote && searching ? [] : options;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate text-start", !echo && "text-muted-foreground")}>
            {echo ? echo : placeholder}
          </span>
          <ChevronsUpDown className="ms-2 size-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] min-w-[220px] max-w-[calc(100vw-1rem)] z-50 shadow-lg"
        align="start"
        sideOffset={6}
        collisionPadding={{ top: 8, left: 8, right: 8, bottom: 88 }}
      >
        <Command
          // Disable cmdk's pointer-move auto-highlight so scroll drags on
          // touch don't get treated as item hover/selection.
          disablePointerSelection
          loop
          shouldFilter={remote ? false : undefined}
        >
          {remote ? (
            <CommandInput
              placeholder={searchPlaceholder}
              value={term}
              onValueChange={(next) => setTerm(next)}
            />
          ) : (
            <CommandInput placeholder={searchPlaceholder} />
          )}
          {hintText ? (
            <div className="border-b px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">
              {hintText}
            </div>
          ) : null}
          <CommandList className="max-h-[50vh] sm:max-h-[260px]">
            <CommandEmpty>{remote && searching && searchingText ? searchingText : emptyText}</CommandEmpty>
            <CommandGroup>
              {visible.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.keywords ?? ""} ${o.value}`}
                  onSelect={() => {
                    if (allowClear && o.value === value) {
                      onChange("");
                    } else {
                      onChange(o.value);
                    }
                    setOpen(false);
                  }}
                >
                  <Check className={cn("me-2 size-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                  {o.detail ? (
                    <span className="ms-2 shrink-0 text-xs tabular-nums text-muted-foreground" dir="ltr">
                      {o.detail}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
