---
name: zmedico-craft-ui
description: ZMedico's binding anti-template UI craft standard. Use for any work that changes how a ZMedico screen looks, feels, moves, or is laid out — new surfaces, redesigns, component work, Tailwind class edits, or UI review. Blocks the generated-template tells (purple gradients, uniform card kits, tracked-caps eyebrows, Inter/Cairo defaults, shadow on everything) and states the product's own visual identity.
metadata:
  author: zmedico
  version: "1.0.0"
  derived-from: references/upstream/ (Anthropic frontend-design, Hallmark floor, Vercel Web Interface Guidelines, ui-ux-pro-max)
  scope: ZMedico clinic platform, React + Vite + Tailwind + shadcn/ui, bilingual ar-EG / en
---

# ZMedico UI Craft

The product is operational medical software used by Egyptian clinic staff — a physiotherapy desk, a
reception queue, a treasury till, a platform console. The users are in a hurry, they work in tables
all day, half of them read right-to-left, and the money column must be trustworthy at a glance.
Design for that, not for a SaaS landing page.

Nothing in this file is waivable without writing the waiver down in the PR description with a real
reason. "It looked better" is not a reason.

## Identity — Clinical Ink

One direction, used consistently. Do not re-litigate it per screen; extend it.

- **Surface**: cool paper neutrals, never cream (`#F4F1EA`-family), never tinted near-black. Deep
  slate-teal ink for inverted rails.
- **Brand**: a single deep clinical teal (`--z-brand-500`). The old purple `--primary` stays only
  where it already exists until the token migration phases retire it — never introduce it in new UI.
- **Signal colour is meaning, never decoration**: green = money in / completed, amber = needs action,
  crimson = money out / destructive / clinical risk. A colour that carries no state does not appear.
- **Type**: IBM Plex Sans + IBM Plex Sans Arabic as one superfamily (deliberate bilingual pairing),
  IBM Plex Mono reserved for identifiers, slugs, and amounts where mono *is* the material.
- **The memorable thing is the table.** Craft budget goes into ledger typography, alignment, and
  density — not into ornament. Everything else stays quiet.

Full token values and Tailwind usage live in the sibling skill `zmedico-design-tokens`. Read it
before writing any style, class, or CSS variable.

## The Floor

1. Every colour, radius, shadow, duration, and font family comes from a declared token. No literal
   `hsl(...)`, no `#hex`, no `rgba(...)`, no `font-family` outside the token block. Tailwind palette
   classes (`purple-600`, `indigo-500`, `emerald-400`) are literals and are equally banned in new code.
2. Never a purple/violet/indigo gradient, never a gradient used as decoration, never `gradient-primary`
   or `gradient-card` in new markup.
3. Never a card inside a card. A panel is either a surface, a section separated by a hairline, or a
   table. Three sibling rounded cards with the same shadow is the strongest template tell in this repo.
4. Radius encodes nesting: `--z-radius-1` for inline elements, `--z-radius-2` for controls,
   `--z-radius-3` for panels, pill only for status. Never one radius on every element regardless of
   hierarchy.
5. Elevation encodes distance from the page. In-content panels use hairline borders and no shadow.
   Shadow appears only on floating layers (menu, dialog, sheet).
6. One primary button style per surface, and one action weight per row. A row of seven equal outline
   buttons is noise: primary + overflow menu.
7. Never `transition-all`; never animate `width`, `height`, `top`, `left`. Transform and opacity only.
8. Every animation has a `prefers-reduced-motion` escape. Motion answers a user action; no scroll
   reveals, no stagger-on-enter, no hover-lift on table rows in an operational surface.
9. Every interactive element has a visible `:focus-visible` state that appears instantly.
10. No eyebrow labels, no tracked ALL-CAPS, no small caps, no `tracking-*` on Arabic (it breaks
    letter joining — the RTL layer already normalises it; do not reintroduce it).
11. No middle-dot-joined meta strings, no arrows glued to link or button text, no decorative status
    dots, no emoji as icons, no invented numbers, counts, testimonials, or logos.
12. Numbers that compare use tabular figures and are right-aligned in RTL-aware logical direction.
    A money value that is not `tabular-nums` is a defect.
13. Table and list tracks use `minmax(0, 1fr)`; every truncatable flex child carries `min-w-0`.
14. Copy states what happens, in the user's vocabulary, in sentence case, active voice. A button
    that says "Publish" produces a toast that says "Published" — the verb survives the whole flow.
15. Empty, loading, and error are designed states, not leftovers. Loading shows geometry that matches
    the real content's shape; empty names the next action; error says what failed and what to do next
    and never apologises.
16. Never invent a metric or a stat. If the number is not measured from data, the component does not
    render it.

## Verified tells already present in this repo

Cite these when reviewing; they are not hypothetical:

- `src/index.css` labels its own theme "Medical Purple Theme" and declares `--gradient-primary` as a
  purple→purple wash; `--radius: 0.75rem` applies one corner radius to every element at every level.
- `PlatformConsole.tsx` renders each tenant as a rounded row carrying up to seven same-weight outline
  buttons, three identical `Stat` cards above it, and a `bg-primary/5` gradient-wash info card.
- `.lovable/` and the `#lovable-badge` CSS block are template-origin leftovers; keep hiding the badge,
  do not copy anything else from that heritage.
- `components.json` is shadcn defaults; primitives are the stock kit, which is why new surfaces must
  restyle at the token layer rather than by adding another card component.

## RTL / LTR optical balance

The product is Arabic-first. Both directions are first-class, and mirroring is not translation.

- Use logical utilities only: `ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`, `text-start`/`text-end`,
  `rounded-s-`/`rounded-e-`. Physical `pl-/pr-/left-/right-/ml-/mr-` in new code is banned; the
  `[dir=rtl]` override list in `index.css` is a patch for legacy usage, not permission to add more.
- `dir` is set on the container that owns the language, and every node whose content is
  direction-neutral (slug, hostname, ISO date, amount with a Latin currency, email) gets `dir="ltr"`
  plus `translate="no"` explicitly, so the Arabic paragraph does not flip it.
- Arabic never gets letter-spacing, never gets ALL-CAPS (it has none), and never gets `truncate`
  without `min-w-0` — Arabic shaping breaks mid-word on clip.
- Icons that imply direction (chevrons, arrows, back) mirror in RTL; icons that imply meaning
  (health, archive, money, warning) do not. `index.css` already mirrors `lucide-chevron-*` and
  `lucide-arrow-*`; check the rest per component.
- Numerals: the desk shows Arabic-Indic digits only where the locale was deliberately chosen;
  platform/finance surfaces use Western digits with `tabular-nums`. Never mix them in one column.
- Adjacent mixed-script runs need a visible gap: Latin inside Arabic text does not inherit the Arabic
  face's advance widths. Wrap identifiers in their own inline element with `font-family: var(--z-font-mono)`.
- Line-height for Arabic body runs is one step above Latin (Cairo/Plex Arabic ascenders/descenders
  collide at 1.4). Do not set a global tight leading.

## Process

1. Read the surface before proposing anything: the component file, the tokens it consumes, the
   contract tests that pin its copy or class strings.
2. Plan in tokens, in writing, before code: surface, type roles, spacing rhythm, what carries the
   hierarchy. If the plan reads like any other dashboard, revise one decision and say which.
3. Build. Append-only to existing stylesheets; new components consume tokens, never literals.
4. Run `node scripts/design-lint.mjs` and fix every finding the ratchet reports. Baseline violations
   are debt, not licence: a new file must enter with zero.
5. Typecheck with the two project references (`tsc -p tsconfig.app.json --noEmit` and
   `tsconfig.node.json`); a bare `tsc --noEmit` checks zero files in this repo.
6. Critique the rendered result, not the diff: screenshot at 1440 and 390 widths, both directions,
   then remove one accessory. If a neighbouring screen in the same product would render identically,
   the hierarchy has failed.
7. Report the evidence tier honestly, per standing owner rule: a class change verified by test is
   `Fixed/Verified`; only a served-bundle or browser check is `Deployed`. A string appearing in a
   shipped chunk proves delivery, not behaviour.

## Do not break

- Text-frozen contract tests in `src/lib/*.test.ts` count occurrences per file
  (`deskFailureContract`, `deleteConfirmationContract`, `zeroRowWriteContract`,
  `branchArchiveSafety`, `branchDeletionSafety`, `bookingInputLimitsContract`) and several read
  migration bytes with `readFileSync`. A craft pass that changes copy or error plumbing must update
  the ledger deliberately and say so in the PR, never silently.
- Tenant white-label: `[data-tenant-branded="true"]` rules use `!important` on `.text-primary`,
  `.bg-sidebar`, `.border-primary`. New token consumers must not rely on those classes inside
  branded surfaces.
- Existing screens are not refactored opportunistically. Redesign is scheduled by phase
  (`docs/design-system/phases.md`), one surface per PR, zero-regression bar.
