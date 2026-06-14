
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS started_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS priority      smallint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS appointments_branch_status_sched_idx
  ON public.appointments (branch_id, status, scheduled_at)
  WHERE deleted_at IS NULL;
