import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The Clinical Ink scale (--z-*) is a Tailwind theme extension, and tailwind-merge only knows
 * the default theme. Without this, `text-z-small` is classified as a text *colour*: it would
 * neither override the `text-sm` a primitive injects nor survive alongside `text-z-ink-900`
 * in the same cn() call, so the type scale would silently collapse to the stock kit's sizes.
 * Registering the token names in the groups their config keys belong to is additive — no
 * legacy class changes meaning, because no legacy class uses these names.
 */
const Z_TYPE_ROLES = [
  "z-display", "z-title", "z-subtitle", "z-body", "z-small", "z-label", "z-micro",
  "z-display-ar", "z-title-ar", "z-subtitle-ar", "z-body-ar", "z-small-ar", "z-label-ar", "z-micro-ar",
];
const Z_SPACING = ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9", "z12", "z16"];

// Every utility group theme.extend.spacing feeds, minus the physical ones the craft standard
// bans in new code (pl/pr/ml/mr/left/right): logical utilities are the only ones that mirror.
const Z_SPACING_UTILITIES = [
  "p", "px", "py", "ps", "pe", "pt", "pb",
  "m", "mx", "my", "ms", "me", "mt", "mb",
  "gap", "gap-x", "gap-y", "space-y",
  "w", "min-w", "max-w", "h", "min-h", "max-h", "size", "basis", "indent",
  "inset", "inset-x", "inset-y", "start", "end", "top", "bottom",
  "translate-x", "translate-y",
];

const spacingGroups = Object.fromEntries(
  Z_SPACING_UTILITIES.map((utility) => [utility, [{ [utility]: Z_SPACING }]]),
);

const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: Z_TYPE_ROLES }],
      rounded: [{ rounded: ["z1", "z2", "z3"] }],
      shadow: [{ shadow: ["z1", "z2"] }],
      duration: [{ duration: ["zquick", "zbase", "zslow"] }],
      ease: [{ ease: ["z-out", "z-in"] }],
      ...spacingGroups,
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
