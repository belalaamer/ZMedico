ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_walk_in boolean NOT NULL DEFAULT false;