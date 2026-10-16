import { supabase } from "@/integrations/supabase/client";
import type { ApptStatus } from "./appointmentStatus";

type QueueConsultationInput = {
  appointmentId: string;
  branchId: string;
  expectedStatus: ApptStatus;
  doctorId: string | null;
  expectedSnapshot: {patient_id: string; doctor_id: string | null; updated_at: string};
};

/** One RPC owns state + encounter. Never fall back to separate writes. */
export async function openQueueConsultation(input: QueueConsultationInput): Promise<string> {
  if (!input.branchId) throw new Error("branch_required");
  if (!input.expectedSnapshot?.updated_at) throw new Error("appointment_snapshot_required");
  const { data, error } = await supabase.rpc("open_queue_consultation", {
    _appointment_id: input.appointmentId,
    _branch_id: input.branchId,
    _expected_status: input.expectedStatus,
    _doctor_id: input.doctorId,
    _expected_snapshot: input.expectedSnapshot,
  });
  if (error) throw error;
  if (typeof data !== "string" || !data) throw new Error("consultation_result_missing");
  return data;
}

export function queueConsultationErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export function queueConsultationErrorMessage(error: unknown, lang: string): string {
  const code = queueConsultationErrorCode(error);
  if (code === "PT409") return lang === "ar"
    ? "تم تحديث الموعد بواسطة مستخدم آخر؛ أعد تحميل الطابور وحاول مجددًا."
    : "This appointment changed. Refresh the queue and try again.";
  if (code === "42501") return lang === "ar"
    ? "ليس لديك صلاحية فتح هذه الاستشارة في الفرع الحالي."
    : "You do not have permission to open this consultation in the current branch.";
  return lang === "ar"
    ? "تعذر تأكيد فتح الاستشارة. حدّث الطابور وتحقق من حالة الزيارة قبل إعادة المحاولة."
    : "Could not confirm the consultation. Refresh the queue and check the visit before retrying.";
}
