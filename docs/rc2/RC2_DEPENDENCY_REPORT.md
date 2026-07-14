# RC2 — Dependency Report

Source: `bun outdated`. No package was updated in RC2.

## Summary
- Outdated (minor/patch, safe to defer): `autoprefixer`, `eslint`,
  `lovable-tagger`, `postcss`, `tailwindcss`, `typescript`,
  `typescript-eslint`, `vite`, `vitest`, `eslint-plugin-react-refresh`.
- Outdated (major, requires migration review): `@types/react`,
  `@types/react-dom` → 19.x; `@vitejs/plugin-react-swc` → 4.x;
  `eslint` → 10.x; `eslint-plugin-react-hooks` → 7.x;
  `globals` → 17.x; `jsdom` → 29.x; `tailwindcss` → 4.x;
  `typescript` → 7.x; `vite` → 8.x; `vitest` → 4.x.
- Deprecated: none flagged.
- Duplicate packages: none material.
- Known security advisories affecting this project: none
  (Dependabot is active and will open PRs for future advisories).

## Recommendation
Defer all major upgrades until post-RC2. Accept minor/patch
updates opportunistically via Dependabot with CI green as the
gate.
