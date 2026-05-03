CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_appointment_notification
ON public.notifications(user_id, related_entity_id, type)
WHERE type = 'appointment' AND related_entity_id IS NOT NULL;