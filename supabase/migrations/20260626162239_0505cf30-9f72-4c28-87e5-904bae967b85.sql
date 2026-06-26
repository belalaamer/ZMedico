-- Phase 2 physio: appointment linkage + follow-up fields
ALTER TABLE public.physio_sessions
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_physio_sessions_appointment ON public.physio_sessions(appointment_id) WHERE appointment_id IS NOT NULL;

ALTER TABLE public.physio_cases
  ADD COLUMN IF NOT EXISTS followup_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_due_date date,
  ADD COLUMN IF NOT EXISTS followup_interval_days integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_summary text,
  ADD COLUMN IF NOT EXISTS pause_reason text;

CREATE INDEX IF NOT EXISTS idx_physio_cases_followup_due ON public.physio_cases(followup_due_date) WHERE followup_enabled AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_physio_cases_status_branch ON public.physio_cases(branch_id, status) WHERE deleted_at IS NULL;