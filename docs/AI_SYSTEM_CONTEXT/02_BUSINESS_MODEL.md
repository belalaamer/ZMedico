# 02 — Business Model

## Commercial model (current)
**Managed SaaS, design-partner sales.** New tenants are onboarded by the operator; there is no public self-serve signup path. `allowed_signup_emails` gates account creation.

## Revenue mechanics
| Layer | Tables | Notes |
|---|---|---|
| Platform → Clinic (SaaS) | `tenants`, `subscriptions`, `subscription_plans`, `subscription_addons`, `tenant_addons`, `tenant_usage`, `saas_invoices`, `saas_payments`, `saas_invoice_counters` | Data model present; billing UI not consumer-facing (**Assumption**: operated manually today). |
| Clinic → Patient (Ops) | `invoices`, `invoice_items`, `payments`, `payment_methods`, `patient_wallets`, `patient_wallet_transactions`, `coupons`, `coupon_redemptions`, `insurance_*`, `treasury*` | Fully operational. |

## Pricing (in-app catalog)
- Landing page: `/pricing` (`src/pages/pricing`).
- Data model supports tiered plans + add-ons.
- **Possible Future Direction**: enable Stripe/Paddle checkout via `payments--enable_stripe_payments` / `payments--enable_paddle_payments`.

## Cost drivers
- Supabase (DB + Auth + Storage + Edge Functions).
- Lovable AI Gateway (if AI features enabled).
- Domain + email deliverability.

## White-label posture
Design tokens in `src/index.css` + shadcn variants enable per-tenant theming. Full white-label is a future wave (see `docs/product/WHITE_LABEL_STRATEGY.md`).
