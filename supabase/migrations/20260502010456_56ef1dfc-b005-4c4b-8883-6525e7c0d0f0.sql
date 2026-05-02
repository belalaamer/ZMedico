ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS check_in_latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS check_in_longitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS check_out_latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS check_out_longitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS check_in_accuracy integer,
  ADD COLUMN IF NOT EXISTS check_out_accuracy integer,
  ADD COLUMN IF NOT EXISTS is_within_branch_radius boolean,
  ADD COLUMN IF NOT EXISTS check_in_reason text;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS allowed_latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS allowed_longitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS allowed_radius integer NOT NULL DEFAULT 100;