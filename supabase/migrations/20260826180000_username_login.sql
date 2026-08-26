-- Optional global login username. Global uniqueness avoids ambiguous
-- resolution when a user belongs to multiple branches or tenants.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR username ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

COMMENT ON COLUMN public.profiles.username IS
  'Optional global login identifier. Email remains the recovery and notification channel.';
