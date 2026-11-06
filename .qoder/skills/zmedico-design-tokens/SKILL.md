---
name: zmedico-design-tokens
description: "The single source of truth for ZMedico's --z-* design tokens: surfaces, ink, lines, brand, signals, typography, spacing, radii, elevation and motion, with the exact Tailwind/CSS usage rules. Use when writing any style value, adding a component that carries colour/spacing/typography, or extending the token set. Never hardcode a hex, px or ms that is not represented here."
version: 1.0.0
scope: project
---

# ZMedico Design Tokens

Every visual value in ZMedico resolves to one of the tokens below. They are declared once
in `src/index.css` under `:root` as `--z-*` custom properties and consumed through the
Tailwind map in `tailwind.config.ts`. Components never carry a literal colour, radius,
duration or font size.

**Legacy note.** The existing shadcn `--background / --primary / --card …` set is still live
and is depended on by tenant white-label overrides in `src/index.css`
(`html[data-tenant-branded="true"]`, ~line 155+) and by every `components/ui/*` primitive.
The `--z-*` set is **additive**. Do not delete or re-value the legacy tokens from inside a
feature branch; the site-wide cutover is Phase 3 in `docs/design-system/phases.md` (repo
root `work/p7-rollup/src`). Until then, platform surfaces consume `--z-*`, and anything
that must render inside a legacy primitive (a `<Button>`, a `<Dialog>`) gets the value
through the token, not through a class.

## 1. Surfaces

| Token | Value | Use |
|---|---|---|
| `--z-surface-canvas` | `206 24% 97%` | Page background. Cool paper, never grey-mauve. |
| `--z-surface-raised` | `0 0% 100%` | Cards, panels, table bodies. |
| `--z-surface-sunk` | `206 20% 94%` | Table header rows, toolbar wells, disabled fills. |
| `--z-surface-inverse` | `203 30% 14%` | The one dark band: masthead, collapsed rail. |
| `--z-surface-overlay` | `206 24% 97% / 0.86` | Sticky headers over scrolling content. |

Dark mode is **not** in scope for batch 1. Do not invent a `.dark` variant of a `--z-*`
token without checking all nine values against 4.5:1 contrast first.

## 2. Ink (text)

| Token | Value | Use | Contrast on canvas |
|---|---|---|---|
| `--z-ink-900` | `205 32% 12%` | Headings, figures, anything you want read first. | 14.1:1 |
| `--z-ink-700` | `205 20% 27%` | Body copy, table cells, labels. | 8.2:1 |
| `--z-ink-500` | `205 14% 45%` | Secondary meta, column headers, helper text. | 4.6:1 |
| `--z-ink-400` | `205 12% 60%` | Disabled, placeholders only. Never for information. | 2.8:1 |

Four steps. If you are reaching for a fifth, you are actually wanting `--z-ink-500` at
`/70` opacity — but do not write that; add a token instead.

## 3. Lines

| Token | Value | Use |
|---|---|---|
| `--z-line-hairline` | `206 18% 90%` | Row dividers, inner separators. The default. |
| `--z-line-edge` | `206 16% 83%` | Card and input borders — visible without being drawn. |
| `--z-line-strong` | `205 18% 68%` | Focus-adjacent edges, dividers that separate two panels. |

Border rule: a `--z-line-edge` border on a raised surface implies the surface has depth.
If you added the border, the shadow tier must match (§8). Choose one, not both at max.

## 4. Brand — deep clinical teal

One accent family, used sparingly. The teal is deliberately *not* the purple the repo
shipped with; purple-on-white is the loudest tell that a product came out of a kit.

| Token | Value | Use |
|---|---|---|
| `--z-brand-900` | `196 55% 18%` | Pressed state, brand text on `brand-050`. |
| `--z-brand-700` | `194 52% 26%` | Primary button fill, links in body copy. 7.4:1 on white. |
| `--z-brand-500` | `190 60% 34%` | The identity colour: active rail marker, selected row marker, focus ring. |
| `--z-brand-100` | `190 45% 88%` | Selection strokes, chart accent line. |
| `--z-brand-050` | `190 42% 96%` | Tinted fills: selected row, count pill, icon chip ground. |

Gradients: **one only**, `--z-gradient-masthead`
(`linear-gradient(180deg, hsl(203 30% 14%), hsl(196 40% 17%))`), and only on
`--z-surface-inverse`. Never diagonal, never two brand hues, never on a card.

## 5. Signals

Each signal ships a fill, an ink and a stroke so badge/table/inline usage stay coherent.

| Family | Fill | Ink | Stroke |
|---|---|---|---|
| `--z-positive-*` | `152 42% 95%` | `154 52% 24%` | `152 35% 82%` |
| `--z-caution-*` | `40 90% 96%` | `32 62% 27%` | `40 62% 82%` |
| `--z-critical-*` | `2 62% 97%` | `358 58% 34%` | `2 55% 87%` |
| `--z-neutral-*` | `206 20% 95%` | `205 16% 38%` | `206 18% 89%` |

Meaning mapping (do not improvise per-screen):
`provisioned / paid / verified / restored` → positive · `trial / needs_review / expiring /
degraded` → caution · `cancelled / overdue / failed / deleted` → critical ·
`draft / inactive / archived / suspended` → neutral.

Signal colour never carries meaning alone — every status control also prints its word.

## 6. Typography

```
--z-font-sans    : "IBM Plex Sans", "Segoe UI", system-ui, sans-serif
--z-font-arabic  : "IBM Plex Sans Arabic", "Cairo", "Noto Naskh Arabic", system-ui, sans-serif
--z-font-mono    : "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace
```

`html:lang(ar)` and `[dir="rtl"]` both resolve to `--z-font-arabic`. Latin and Arabic are
**different stacks with different metrics** — never assume a size that worked in EN is the
same optical weight in AR. Arabic needs +1px at every role below 17 and ~1.75 line-height
at body size (§ of craft-ui, RTL section).

| Role | Token | EN size/line | AR size/line | Weight | Tracking | Numerals |
|---|---|---|---|---|---|---|
| Display | `--z-text-display` | 30 / 36 | 30 / 42 | 600 | `-0.015em` | `tnum` |
| Title | `--z-text-title` | 22 / 28 | 22 / 33 | 600 | `-0.011em` | `tnum` |
| Subtitle | `--z-text-subtitle` | 17 / 24 | 18 / 28 | 600 | `-0.005em` | `tnum` |
| Body | `--z-text-body` | 15 / 24 | 16 / 28 | 400 | `0` | proportional |
| Small | `--z-text-small` | 13 / 20 | 14 / 23 | 400 | `0` | proportional |
| Label | `--z-text-label` | 13 / 18 | 14 / 20 | 500 | `0.01em` | `tnum` |
| Micro | `--z-text-micro` | 12 / 16 | 13 / 19 | 500 | `0.02em` | `tnum` |

Hard rules:
- **No `uppercase` + `tracking-widest` eyebrow labels.** That combination is the #1
  generated-template tell. `--z-text-label` is cased normally.
- Every numeric column, counter, amount and timestamp gets
  `font-variant-numeric: tabular-nums` (`tnum`).
- IDs, slugs, hostnames, ISO codes, amounts: `dir="ltr" translate="no"` +
  `--z-font-mono` at the role's size.
- Never below 12px. There is no 11px in this system.

## 7. Spacing

4px base, powers that stay calm at density:

```
--z-space-1  : 4px     --z-space-5  : 20px    --z-space-9  : 36px
--z-space-2  : 8px     --z-space-6  : 24px    --z-space-12 : 48px
--z-space-3  : 12px    --z-space-7  : 28px    --z-space-16 : 64px
--z-space-4  : 16px    --z-space-8  : 32px
```

| Decision | Answer |
|---|---|
| Inside a control (icon↔label) | `--z-space-2` |
| Between sibling controls | `--z-space-2` or `--z-space-3` |
| Between label and its field | `--z-space-2` (never more — proximity beats alignment) |
| Card padding, dense | `--z-space-4` |
| Card padding, default | `--z-space-6` |
| Between a heading and its block | `--z-space-3` |
| Between two blocks | `--z-space-6` or `--z-space-8` |
| Page gutter (mobile / desktop) | `--z-space-4` / `--z-space-6` |
| Table cell | `10px` block × `12px` inline — the one non-scale value, justified by row rhythm |

Anything that is not on this list is a mistake. If two adjacent gaps differ by 2px, that
is visual noise, not precision — make them equal.

## 8. Radii and elevation

Radii are **by nesting depth**, not by component size:

```
--z-radius-1 : 2px    inline code, count pills, bar ends
--z-radius-2 : 4px    buttons, inputs, chips, icon buttons
--z-radius-3 : 6px    cards, panels, popovers, modals, table container
--z-radius-full : 999px    avatars and status dots only
```

Never `rounded-lg`-everything, never a 12–16px radius on a control a user clicks 40 times a
day. An outer panel is always ≥ the radius of what sits inside it.

Elevation — two tiers, and only two:

```
--z-shadow-1 : 0 1px 2px hsl(205 32% 12% / 0.05)             rest state, cards
--z-shadow-2 : 0 6px 16px -4px hsl(205 32% 12% / 0.12),
               0 1px 3px hsl(205 32% 12% / 0.06)             float state, menus/modals
```

Elevation encodes distance from the page, not importance. A "important-looking" card gets
a better heading and more whitespace, never a bigger shadow.

Focus ring: `--z-ring` = `190 60% 34%`, `2px`, `offset 2px`, via
`:focus-visible` on every interactive element. `outline: none` with no replacement is a
release blocker.

## 9. Motion

```
--z-duration-quick : 90ms     hover, press, colour
--z-duration-base  : 140ms    disclosure, popover in
--z-duration-slow  : 220ms    modal/panel enter, number settle
--z-ease-out : cubic-bezier(0.20, 0.00, 0.00, 1.00)   entering / responding
--z-ease-in  : cubic-bezier(0.30, 0.00, 0.80, 0.15)   exiting
```

Exit is faster than enter. Animate `transform` and `opacity` only — never `height`,
`width`, `top/left`, `margin`. No stagger longer than 24ms between siblings.
Every block sits under:

```css
@media (prefers-reduced-motion: reduce) { … transition/animation suppressed … }
```

## 10. Tailwind usage

Map in `tailwind.config.ts` (already wired):

```
z-canvas  z-raised  z-sunk  z-inverse
z-ink-900 z-ink-700 z-ink-500 z-ink-400
z-line-hairline z-line-edge z-line-strong
z-brand-900 z-brand-700 z-brand-500 z-brand-100 z-brand-050
z-positive z-caution z-critical z-neutral  (+ /fill /stroke variants)
z-r1 z-r2 z-r3
```

So a card is `bg-z-raised text-z-ink-700 rounded-z-r3 border-z-line-edge shadow-z-1`, and
its heading is `text-z-ink-900`. Raw `hsl(…)` in a component `.tsx` is a violation even
when the number happens to match a token.

## 11. Adding a token

1. Confirm no existing token expresses it (four inks and three lines is intentional).
2. Add it to `:root` in `src/index.css` next to its family, with a one-line use note.
3. Add the Tailwind map entry in the same PR.
4. Use it in at least two places in the same PR, or do not add it.
