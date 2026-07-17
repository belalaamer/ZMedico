ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_doctor_id ON public.invoices(doctor_id);