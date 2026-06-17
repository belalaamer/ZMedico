ALTER TABLE public.queue_settings
  ADD COLUMN IF NOT EXISTS no_show_rate_threshold integer NOT NULL DEFAULT 25 CHECK (no_show_rate_threshold BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS busy_queue_threshold integer NOT NULL DEFAULT 8 CHECK (busy_queue_threshold BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS alerts_on_dashboard boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alerts_on_queue boolean NOT NULL DEFAULT true;