-- Add InstaPay as a first-class collection method.
--
-- Additive only: no table, row, function, policy, or existing enum label is
-- changed or removed. The new label is deliberately introduced in its own
-- migration because PostgreSQL makes an enum value usable only after this
-- statement commits. Any later migration/function that compares a payment to
-- 'instapay' must therefore run in a subsequent transaction.
--
-- Scope: public.payment_method only. public.expense_method stays unchanged
-- until a separate, explicitly reviewed migration asks for it.

alter type public.payment_method
  add value if not exists 'instapay';
