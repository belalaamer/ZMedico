import { supabase } from "@/integrations/supabase/client";
import type { ApptStatus } from "./appointmentStatus";

type QueueMutation = {
  appointmentId: string;
  branchId: string;
  patch: Record<string, unknown>;
  expectedStatus: ApptStatus;
  expectedPriority?: number | null;
};

/** Compare-and-set against the appointment snapshot shown to the user. */
export async function updateQueueAppointment(input: QueueMutation): Promise<boolean> {
  if (!input.branchId) throw new Error("branch_required");
  let query = supabase.from("appointments")
    .update(input.patch as never)
    .eq("id", input.appointmentId)
    .eq("branch_id", input.branchId)
    .eq("status", input.expectedStatus);
  if (input.expectedPriority !== undefined) query = input.expectedPriority === null ? query.is("priority", null) : query.eq("priority", input.expectedPriority);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
