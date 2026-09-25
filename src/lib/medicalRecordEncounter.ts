import { supabase } from "@/integrations/supabase/client";

type EncounterInput = {
  appointmentId: string;
  patientId: string;
  branchId: string | null;
  doctorId: string | null;
  createdBy?: string | null;
};

type EncounterRef = { id: string };

async function findActiveEncounter(appointmentId: string): Promise<EncounterRef | null> {
  const { data, error } = await supabase
    .from("medical_records")
    .select("id")
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data?.[0] as EncounterRef | undefined) ?? null;
}

/**
 * Returns the active medical record linked to an appointment, creating it when
 * absent. The database owns the one-active-record-per-appointment invariant.
 *
 * A concurrent caller can win the INSERT after our initial read. In that case
 * PostgreSQL returns 23505 from the partial unique index and we re-read the
 * winning row instead of surfacing a false failure or creating a duplicate.
 */
export async function getOrCreateAppointmentMedicalRecord(
  input: EncounterInput,
): Promise<EncounterRef> {
  const existing = await findActiveEncounter(input.appointmentId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("medical_records")
    .insert({
      patient_id: input.patientId,
      appointment_id: input.appointmentId,
      branch_id: input.branchId,
      doctor_id: input.doctorId,
      visit_type: "consultation",
      status: "draft",
      created_by: input.createdBy ?? null,
    } as never)
    .select("id")
    .single();

  if (!error && data?.id) return data as EncounterRef;

  if (error?.code === "23505") {
    const winner = await findActiveEncounter(input.appointmentId);
    if (winner) return winner;
  }

  throw error ?? new Error("medical_record_creation_failed");
}
