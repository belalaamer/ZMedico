---
name: zmedico-ui-review
description: "Two-pass review procedure for ZMedico UI work: a machine gate (design lint, typechecks, tests, contrast) followed by a human-eye critique at 1440 and 390 in both LTR and RTL. Use before reporting any UI change as done, when asked to review a PR that touches styles, or when a screen 'looks off' and you need a systematic way to find why. Produces the standard verdict format."
version: 1.0.0
scope: project
---

# ZMedico UI Review

Reviews are adversarial. The point is to find the reason not to ship, not to confirm the
work. `zmedico-craft-ui` says what good looks like; this says how to prove you reached it.

Never report a UI change as done from code reading alone. If you cannot render it, say
**"not visually verified"** in the verdict — that phrase is allowed, a false pass is not.

## Pass 1 — Machine gate (must be green before a human look)

Run from repo root `work/p7-rollup/src`:

```bash
node scripts/design-lint.mjs                 # token discipline + tell patterns
npm run typecheck                            # tsc -p tsconfig.app.json && -p tsconfig.node.json
npm run test                                 # vitest run, incl. the frozen contract ledgers
npm run lint                                 # eslint .
npm run build                                # typechecks again, then vite build
```

`npm run typecheck` is the gate — it is literally
`tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json`. Running
`npx tsc --noEmit` with **no** `-p` checks zero files in this repo (root tsconfig is
`files: []` + references) and exits 0. A green bare typecheck means nothing.

Contract ledgers that fail when you add error handling to a page:
`deskFailureContract` (per-file `setFailure` counts), `deleteConfirmationContract`,
`zeroRowWriteContract`. Route new error surfaces through the existing mediator helper or
update the ledger count deliberately in the same PR and say why in the description.

Design lint is rule-based, so it catches the boring 70%: literal hex/`rgb()` in `.tsx`,
`transition-all`, `tracking-widest` on an Arabic-rendered node, `text-left`/`right` where
`start`/`end` belongs, `rounded-lg` without a nesting check, `height`/`width` in a
transition, missing `focus-visible`, empty `alt`. Read its output; do not tune the rule set
to make a diff pass.

## Pass 2 — The eye (10 minutes, four renders)

Render at **1440×900** and **390×844**, in **EN (ltr)** and **AR (rtl)**. That is four
screens minimum for anything user-facing. Screenshot them; critique from the images, not
from memory of the code.

Then answer these in order, in writing:

1. **Where does the eye land first?** If the answer is "a card border", "a gradient", or
   "everything at once", the hierarchy is broken.
2. **Name the one memorable element.** If you cannot name one, the screen is a template.
   If you can name two, one of them must go.
3. **Squint.** Blurred, is the structure still legible? Count the distinct grey levels you
   can distinguish — more than four means ink steps are being improvised.
4. **Measure two adjacent gaps** with the devtools ruler. Off by 1–3px → make equal or make
   intentional (2×).
5. **Read every number on screen.** For each: where did it come from? A number with no
   query behind it is a fabrication and must be deleted, not restyled.
6. **Do the destructive thing on staging.** Is it reversible? Is the label the verb it
   actually performs? Is the confirm typed where the consequence is irreversible?
7. **Tab through.** Every stop visible, no traps, order matches reading order in RTL too.
8. **Empty, loading, error.** Force all three. A skeleton that isn't shaped like the
   content it replaces is a bug, not a polish item.

## The removal pass

Before you call it done, remove exactly one decorative element — an icon chip, a border, a
tint, a subtitle, a divider — and look again. Most template-feel comes from
*accessories*, and the fastest way to lose it is to stop adding things that would also
appear on a generic dashboard. If nothing got worse, the element was noise: keep it out.

## Contrast spot-check

For each text/background pair actually on screen (not in the token file), compute
`WCAG ratio`. Body text needs 4.5:1, large text (≥22px or ≥18px bold) 3:1, non-text
controls and status markers 3:1. `--z-ink-400` on `--z-surface-canvas` is 2.8:1 and is
therefore illegal for anything a user must read — it exists only for disabled states.

Quick formula, no library:

```js
const L = (h,s,l) => { /* hsl→rgb→linear */ };
const cr = (a,b) => (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
```

## RTL-specific checks

`rtl_level` is not uniform across styles; check per component:

- Direction-bearing icons (chevron, arrow, back, external-link) mirror. Meaning-bearing
  icons (calendar, money, user, stethoscope) do **not**.
- Numerals: one digit system per screen. Latin digits in Arabic UI are fine; mixed in the
  same row is not.
- Slugs, hostnames, ISO codes, EGP/SAR amounts: `dir="ltr"`, `translate="no"`, `tnum`.
- No `letter-spacing`, no `uppercase`, no all-caps abbreviation on Arabic runs.
- Justified/stretch text in Arabic creates rivers — `text-align: start` only.
- Truncation: `min-w-0` on every flex child that can hold Arabic, or the container grows
  and you get horizontal scroll.
- Shadows and asymmetric radii are physical — a `rounded-l-*` card in RTL should be
  `rounded-s-*`.

## Verdict format

```
VERDICT: pass | pass-with-followups | block
Gate:    design-lint <n> | tsc app|root | vitest <pass>/<total> | build <ok|fail>
Visual:  1440-en 1440-ar 390-en 390-ar   (each: seen | not-rendered)
Blockers: file:line — one-line reason — required fix
Followups: same shape, non-blocking
Evidence tier: source-only | built | deployed-staging | verified-in-browser
```

The last line is not optional. "Fixed" and "Verified" are different claims and the owner
reads them differently. Never let a source-only change be reported as though it was seen
in a browser.

## What "block" is for

Only these things: a11y failures, fabricated data, irreversible action without a real
guard, horizontal scroll, a tell the craft standard names explicitly (purple gradient,
eyebrow caps, card-in-card, transition-all, kit-uniform cards), or a red gate.
Everything else is a followup. Review is not a licence to redo someone's screen.
