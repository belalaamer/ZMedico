# 29 — Marketplace Guide (Future Direction)

Source: `docs/product/PLUGIN_ARCHITECTURE.md`, `docs/product/WHITE_LABEL_STRATEGY.md`.

## Envisioned model
- Curated marketplace of specialty packs (dental, physio, derma, aesthetics, veterinary…).
- Per-tenant install/enable via `tenant_addons`.
- Metering via `tenant_usage`.
- Billing via `saas_invoices` + external provider (Stripe/Paddle).

## Non-goals for now
- No public marketplace UI exists.
- No plugin runtime installer.

Marked **Possible Future Direction**. All references here are aspirational.
