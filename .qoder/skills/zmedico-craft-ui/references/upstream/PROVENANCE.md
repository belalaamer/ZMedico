# Upstream reference provenance

Verbatim copies of the public skills this project's craft standard was distilled from.
They are **dev-time reference material**: read them to understand *why* a rule exists, or
to borrow a pattern for a new surface. They are not loaded by the app, not imported by any
build step, and not shipped in the product bundle.

Everything here was pulled by HTTP on **2026-11-06 (UTC)** and verified by sha256 against a
second fetch on **2026-11-06T12:16Z**. If a file's hash below does not match the copy on
disk, the copy has drifted and must be re-fetched rather than trusted.

| File | Upstream | sha256 | License / terms |
|---|---|---|---|
| `anthropic-frontend-design.md` | [anthropics/skills → `skills/frontend-design/SKILL.md`](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) | `d91970639e9f5c37682ac7ab60094d35f1c7c1f38d731bd56396563aee10c1d3` | Upstream declares "Complete terms in `LICENSE.txt`" — see repo license file before redistributing outside this workspace. |
| `hallmark.md` | [Nutlope/hallmark → `skills/hallmark/SKILL.md`](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/SKILL.md) | `25a1ff92d925b2389e8409f42fb8ad7e033fceca8b5d1f07ed4ca4c28da53dc3` | Anti-AI-slop design skill. Check the repo's license before copying into another product. |
| `ui-ux-pro-max.md` | [nextlevelbuilder/ui-ux-pro-max-skill → `.claude/skills/ui-ux-pro-max/SKILL.md`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md) | `9aa50bd44076db28624ea976056d915905ab9357748f90263a004fa0ef087147` | Search-driven design intelligence (styles, palettes, font pairings, UX rules, RTL levels). |
| `ui-ux-pro-max-design-system.md` | [same repo → `.claude/skills/design-system/SKILL.md`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/design-system/SKILL.md) | `8aa5ff93320559a6e5289d37b6b06b3307737dbfb4a6f3fc44135c705613c511` | MIT (per frontmatter). Source of the primitive→semantic→component token layering. |
| `vercel-web-interface-guidelines.md` | [vercel-labs/web-interface-guidelines → `command.md`](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md) | `d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234` | Vercel's UI code-review checklist. |

## What was taken from each

| Source | Adopted into | Rule(s) |
|---|---|---|
| Anthropic `frontend-design` | `zmedico-craft-ui` | Subject-matter grounding before styling; type carries the personality; the five generation tells; plan → build → critique in two passes; "spend your boldness in one place". |
| Hallmark | `zmedico-craft-ui` §The Floor | The non-waivable floor: token-only values, no `transition: all`, no purple-blue gradient, no card-in-card, no eyebrow/tracked-caps labels, no middle-dot meta strings, no arrows glued to link text, `overflow-x: clip`, `minmax(0,1fr)`, focus-visible everywhere, reduced-motion, no invented metrics. Also the removal pass ("take one accessory off"). |
| ui-ux-pro-max | `zmedico-ui-review` | Priority ordering (a11y → touch → perf → style → layout → type/color → motion → forms → nav → charts) and the `rtl_level` vocabulary (`full` / `partial` / `caveats`) used in the RTL checks. |
| ui-ux-pro-max `design-system` | `zmedico-design-tokens` | Three-layer token architecture and the rule that a component consumes semantic tokens only. |
| Vercel Web Interface Guidelines | `zmedico-ui-review` | The machine-checkable checklist halves (forms, focus, animation, i18n, perf) and the terse `file:line` verdict format. |

## What was deliberately **not** taken

- **Doctolib / Linear / Stripe visual languages as templates.** Their surfaces were studied
  for *decisions* (restrained accent, density with generous line-height, one dark band,
  tabular numerals in every money column) and those decisions are restated as ZMedico rules
  in `zmedico-design-tokens`. No palette, type scale or layout was copied — copying another
  company's identity would trade "template" for "knockoff", which is the same failure.
- **ui-ux-pro-max's runtime search script and CSV corpora.** It needs Python plus ~50 files
  of data for a one-off direction question. The relevant findings were extracted once and
  checked into the skills; the tool itself is not vendored.
- **Hallmark's `sloplint.mjs`.** Its assumptions (BEM-ish CSS, no Tailwind) do not match
  this repo; `scripts/design-lint.mjs` implements the equivalent checks for the actual stack.

## Refresh procedure

```bash
curl -sfL https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md \
  -o .qoder/skills/zmedico-craft-ui/references/upstream/anthropic-frontend-design.md
shasum -a 256 .qoder/skills/zmedico-craft-ui/references/upstream/*.md
```

After any re-fetch: diff against the summary table above, and if the content changed in a
way that contradicts a rule in `zmedico-craft-ui`, update the derived rule in the same
commit — the local skills are binding, upstream is an input.
