
CREATE OR REPLACE FUNCTION public.renumber_active_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  y INT;
  cnt_by_year JSONB := '{}'::jsonb;
  n INT;
  new_num TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoices_invoice_number'));

  -- Pass 1: move all active invoices to a temp unique number to free up the desired numbers
  UPDATE public.invoices
    SET invoice_number = 'TMP-' || id::text
    WHERE deleted_at IS NULL;

  -- Pass 2: assign final sequential numbers per year
  FOR r IN
    SELECT id, invoice_date, created_at
    FROM public.invoices
    WHERE deleted_at IS NULL
    ORDER BY invoice_date ASC, created_at ASC, id ASC
  LOOP
    y := EXTRACT(YEAR FROM r.invoice_date)::int;
    n := COALESCE((cnt_by_year ->> y::text)::int, 0) + 1;
    cnt_by_year := jsonb_set(cnt_by_year, ARRAY[y::text], to_jsonb(n), true);
    new_num := 'INV-' || y::text || '-' || lpad(n::text, 4, '0');

    -- If a soft-deleted invoice still holds this number, rename it out of the way
    UPDATE public.invoices
      SET invoice_number = 'OLD-' || id::text
      WHERE invoice_number = new_num AND deleted_at IS NOT NULL;

    UPDATE public.invoices SET invoice_number = new_num WHERE id = r.id;
  END LOOP;

  FOR r IN SELECT key AS y, value::int AS v FROM jsonb_each_text(cnt_by_year) LOOP
    INSERT INTO public.invoice_counters(year, last_value)
      VALUES (r.y::int, r.v)
      ON CONFLICT (year) DO UPDATE SET last_value = EXCLUDED.last_value;
  END LOOP;
END;
$$;

SELECT public.renumber_active_invoices();
