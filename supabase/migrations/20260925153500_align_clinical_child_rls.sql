-- Align clinical child-table RLS with the canonical permission model.
--
-- Legacy policies named roles directly and drifted from canonical RBAC:
-- manager/reception/accountant retained direct clinical capabilities even
-- after those grants were removed from authz bundles. These tables are empty
-- in Production at the time of this migration, so hardening happens before
-- clinical child data is populated.

-- ---------------------------------------------------------------------------
-- Medical history
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hist_select_clinical ON public.medical_history;
DROP POLICY IF EXISTS hist_insert_clinical ON public.medical_history;
DROP POLICY IF EXISTS nurse_history_insert ON public.medical_history;
DROP POLICY IF EXISTS hist_update_clinical ON public.medical_history;
DROP POLICY IF EXISTS nurse_history_update ON public.medical_history;
DROP POLICY IF EXISTS hist_delete ON public.medical_history;

CREATE POLICY hist_select_clinical ON public.medical_history
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.view')
);
CREATE POLICY hist_insert_clinical ON public.medical_history
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.create')
);
CREATE POLICY hist_update_clinical ON public.medical_history
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
);
CREATE POLICY hist_delete ON public.medical_history
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.delete')
);

-- ---------------------------------------------------------------------------
-- Dental chart
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS dent_select_clinical ON public.dental_chart;
DROP POLICY IF EXISTS dent_insert_clinical ON public.dental_chart;
DROP POLICY IF EXISTS dent_update_clinical ON public.dental_chart;
DROP POLICY IF EXISTS dent_delete ON public.dental_chart;

CREATE POLICY dent_select_clinical ON public.dental_chart
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.view')
);
CREATE POLICY dent_insert_clinical ON public.dental_chart
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.create')
);
CREATE POLICY dent_update_clinical ON public.dental_chart
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
);
CREATE POLICY dent_delete ON public.dental_chart
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.delete')
);

-- ---------------------------------------------------------------------------
-- Patient documents metadata
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS doc_select_scoped ON public.patient_documents;
DROP POLICY IF EXISTS doc_insert_staff ON public.patient_documents;
DROP POLICY IF EXISTS doc_update_staff ON public.patient_documents;
DROP POLICY IF EXISTS doc_delete ON public.patient_documents;

CREATE POLICY doc_select_scoped ON public.patient_documents
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.view')
);
CREATE POLICY doc_insert_staff ON public.patient_documents
FOR INSERT TO authenticated
WITH CHECK (
  (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'medical_records.create')
  )
  AND uploaded_by = (SELECT auth.uid())
);
CREATE POLICY doc_update_staff ON public.patient_documents
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
);
CREATE POLICY doc_delete ON public.patient_documents
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.delete')
);

-- ---------------------------------------------------------------------------
-- Prescriptions and their items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS rx_select_clinical ON public.prescriptions;
DROP POLICY IF EXISTS rx_insert_clinical ON public.prescriptions;
DROP POLICY IF EXISTS rx_update_clinical ON public.prescriptions;
DROP POLICY IF EXISTS rx_delete ON public.prescriptions;

CREATE POLICY rx_select_clinical ON public.prescriptions
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.view')
);
CREATE POLICY rx_insert_clinical ON public.prescriptions
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.create')
);
CREATE POLICY rx_update_clinical ON public.prescriptions
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
);
CREATE POLICY rx_delete ON public.prescriptions
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.delete')
);

DROP POLICY IF EXISTS rxi_select_clinical ON public.prescription_items;
DROP POLICY IF EXISTS rxi_write ON public.prescription_items;
DROP POLICY IF EXISTS rxi_update ON public.prescription_items;
DROP POLICY IF EXISTS rxi_delete ON public.prescription_items;

CREATE POLICY rxi_select_clinical ON public.prescription_items
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.view')
);
CREATE POLICY rxi_write ON public.prescription_items
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.create')
);
CREATE POLICY rxi_update ON public.prescription_items
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
);
CREATE POLICY rxi_delete ON public.prescription_items
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.delete')
);

-- ---------------------------------------------------------------------------
-- Diagnoses/procedures attached to a medical record
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS rdx_select_clinical ON public.record_diagnoses;
DROP POLICY IF EXISTS rdx_write ON public.record_diagnoses;
DROP POLICY IF EXISTS rdx_update ON public.record_diagnoses;
DROP POLICY IF EXISTS rdx_delete ON public.record_diagnoses;

CREATE POLICY rdx_select_clinical ON public.record_diagnoses
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.view')
);
CREATE POLICY rdx_write ON public.record_diagnoses
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.create')
);
CREATE POLICY rdx_update ON public.record_diagnoses
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
);
CREATE POLICY rdx_delete ON public.record_diagnoses
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.delete')
);

DROP POLICY IF EXISTS rproc_select_clinical ON public.record_procedures;
DROP POLICY IF EXISTS rproc_write ON public.record_procedures;
DROP POLICY IF EXISTS rproc_update ON public.record_procedures;
DROP POLICY IF EXISTS rproc_delete ON public.record_procedures;

CREATE POLICY rproc_select_clinical ON public.record_procedures
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.view')
);
CREATE POLICY rproc_write ON public.record_procedures
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.create')
);
CREATE POLICY rproc_update ON public.record_procedures
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
);
CREATE POLICY rproc_delete ON public.record_procedures
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.delete')
);

-- ---------------------------------------------------------------------------
-- Vitals use their dedicated canonical capability.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vit_select_clinical ON public.vital_signs;
DROP POLICY IF EXISTS vit_insert_clinical ON public.vital_signs;
DROP POLICY IF EXISTS nurse_vitals_insert ON public.vital_signs;
DROP POLICY IF EXISTS vit_update_clinical ON public.vital_signs;
DROP POLICY IF EXISTS nurse_vitals_update ON public.vital_signs;
DROP POLICY IF EXISTS vit_delete ON public.vital_signs;

CREATE POLICY vit_select_clinical ON public.vital_signs
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'vitals.view')
);
CREATE POLICY vit_insert_clinical ON public.vital_signs
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'vitals.create')
);
CREATE POLICY vit_update_clinical ON public.vital_signs
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'vitals.edit')
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'vitals.edit')
);
CREATE POLICY vit_delete ON public.vital_signs
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'vitals.delete')
);

-- ---------------------------------------------------------------------------
-- Treatment plans and their sessions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tp select" ON public.treatment_plans;
DROP POLICY IF EXISTS "tp insert" ON public.treatment_plans;
DROP POLICY IF EXISTS "tp update" ON public.treatment_plans;
DROP POLICY IF EXISTS "tp delete" ON public.treatment_plans;

CREATE POLICY "tp select" ON public.treatment_plans
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'treatment_plans.view')
);
CREATE POLICY "tp insert" ON public.treatment_plans
FOR INSERT TO authenticated
WITH CHECK (
  (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'treatment_plans.create')
  )
  AND (
    NOT public.has_role((SELECT auth.uid()), 'doctor'::public.app_role)
    OR doctor_id IS NULL
    OR doctor_id = (SELECT auth.uid())
  )
);
CREATE POLICY "tp update" ON public.treatment_plans
FOR UPDATE TO authenticated
USING (
  (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'treatment_plans.edit')
  )
  AND (
    NOT public.has_role((SELECT auth.uid()), 'doctor'::public.app_role)
    OR doctor_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'treatment_plans.edit')
  )
  AND (
    NOT public.has_role((SELECT auth.uid()), 'doctor'::public.app_role)
    OR doctor_id IS NULL
    OR doctor_id = (SELECT auth.uid())
  )
);
CREATE POLICY "tp delete" ON public.treatment_plans
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'treatment_plans.delete')
);

DROP POLICY IF EXISTS "ts select" ON public.treatment_sessions;
DROP POLICY IF EXISTS "ts insert" ON public.treatment_sessions;
DROP POLICY IF EXISTS "ts update" ON public.treatment_sessions;
DROP POLICY IF EXISTS "ts delete" ON public.treatment_sessions;

CREATE POLICY "ts select" ON public.treatment_sessions
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'treatment_plans.view')
);
CREATE POLICY "ts insert" ON public.treatment_sessions
FOR INSERT TO authenticated
WITH CHECK (
  (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'treatment_plans.edit')
  )
  AND (
    NOT public.has_role((SELECT auth.uid()), 'doctor'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.treatment_plans tp
      WHERE tp.id = treatment_sessions.treatment_plan_id
        AND tp.doctor_id = (SELECT auth.uid())
    )
  )
);
CREATE POLICY "ts update" ON public.treatment_sessions
FOR UPDATE TO authenticated
USING (
  (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'treatment_plans.edit')
  )
  AND (
    NOT public.has_role((SELECT auth.uid()), 'doctor'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.treatment_plans tp
      WHERE tp.id = treatment_sessions.treatment_plan_id
        AND tp.doctor_id = (SELECT auth.uid())
    )
  )
)
WITH CHECK (
  (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'treatment_plans.edit')
  )
  AND (
    NOT public.has_role((SELECT auth.uid()), 'doctor'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.treatment_plans tp
      WHERE tp.id = treatment_sessions.treatment_plan_id
        AND tp.doctor_id = (SELECT auth.uid())
    )
  )
);
CREATE POLICY "ts delete" ON public.treatment_sessions
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'treatment_plans.delete')
);
