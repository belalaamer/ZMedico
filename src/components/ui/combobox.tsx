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
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

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
          <span className={cn("truncate text-start", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
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
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[50vh] sm:max-h-[260px]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
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
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}