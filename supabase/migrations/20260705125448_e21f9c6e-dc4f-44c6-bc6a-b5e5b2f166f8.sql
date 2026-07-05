
CREATE OR REPLACE FUNCTION public.tg_performance_review_self_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- HR and admin may change any field.
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'hr'::app_role) THEN
    RETURN NEW;
  END IF;

  -- For the employee editing their own review, only staff_comments may change.
  IF NEW.staff_id = auth.uid() THEN
    IF NEW.rating                IS DISTINCT FROM OLD.rating
       OR NEW.reviewer_comments  IS DISTINCT FROM OLD.reviewer_comments
       OR NEW.strengths          IS DISTINCT FROM OLD.strengths
       OR NEW.areas_for_improvement IS DISTINCT FROM OLD.areas_for_improvement
       OR NEW.review_period_start IS DISTINCT FROM OLD.review_period_start
       OR NEW.review_period_end   IS DISTINCT FROM OLD.review_period_end
       OR NEW.reviewer_id        IS DISTINCT FROM OLD.reviewer_id
       OR NEW.staff_id           IS DISTINCT FROM OLD.staff_id
       OR NEW.status             IS DISTINCT FROM OLD.status
       OR NEW.review_date        IS DISTINCT FROM OLD.review_date
    THEN
      RAISE EXCEPTION 'Forbidden: employees may only edit their own staff_comments on a performance review';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_performance_review_self_update_guard() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_performance_review_self_update_guard ON public.performance_reviews;
CREATE TRIGGER trg_performance_review_self_update_guard
BEFORE UPDATE ON public.performance_reviews
FOR EACH ROW
EXECUTE FUNCTION public.tg_performance_review_self_update_guard();
