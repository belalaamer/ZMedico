-- Static contract test for wallet branch isolation.
-- Run inside a transaction-isolated pgTAP harness with the function definition
-- loaded from the current schema.
select plan(3);

select ok(
  position('wallet branch must match the patient branch' in pg_get_functiondef('public.apply_wallet_tx(uuid, public.wallet_tx_type, numeric, text, uuid, text, text, uuid)'::regprocedure)) > 0,
  'apply_wallet_tx rejects a branch different from the patient branch'
);

select ok(
  position('patient is outside the caller branch scope' in pg_get_functiondef('public.apply_wallet_tx(uuid, public.wallet_tx_type, numeric, text, uuid, text, text, uuid)'::regprocedure)) > 0,
  'apply_wallet_tx keeps the existing caller branch-scope guard'
);

select ok(
  position('patient_wallet_transactions' in pg_get_functiondef('public.apply_wallet_tx(uuid, public.wallet_tx_type, numeric, text, uuid, text, text, uuid)'::regprocedure)) > 0,
  'apply_wallet_tx writes the transaction through the guarded path'
);

select * from finish();
