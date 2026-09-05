// Tool registry + dispatcher for the ZMedico AI agent.
//
// SECURITY: tenant_id / branch_id are NEVER taken from model-provided
// arguments. Every dispatch call receives a server-resolved `trustedContext`
// built BEFORE the model was ever invoked (from conversations/channel_accounts
// rows), and that trusted context -- not toolCall.args -- is what gets passed
// into the underlying Postgres RPCs. Any `tenant_id`/`branch_id` key present
// in toolCall.args is ignored/discarded.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { ToolCall, ToolDefinition } from "./ai-provider.ts";

export type TrustedContext = {
  tenant_id: string;
  branch_id: string | null;
  conversation_id: string;
  channel_account_id: string;
  external_contact_id: string;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_clinic_info",
    description:
      "Returns the clinic's branches, services (with price and description), and doctors for this tenant. " +
      "Call this once per conversation turn when you need clinic facts (branch list, service list/prices, doctor list) -- " +
      "do not call get_services or get_doctors separately, this single tool already returns all of it.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "check_available_slots",
    description:
      "Returns real available appointment slots for a given branch, service, and date (optionally filtered to one doctor). " +
      "Only state availability that comes from this tool's result -- never guess or invent slots.",
    parameters: {
      type: "object",
      properties: {
        branch_id: { type: "string", description: "Branch UUID (from get_clinic_info)" },
        service_id: { type: "string", description: "Service UUID (from get_clinic_info)" },
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        doctor_id: { type: "string", description: "Optional doctor UUID to filter slots" },
      },
      required: ["branch_id", "service_id", "date"],
    },
  },
  {
    name: "find_patient_by_phone",
    description: "Looks up an existing patient record by phone number, for verification before booking/rescheduling/canceling.",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string", description: "Patient phone number" },
      },
      required: ["phone"],
    },
  },
  {
    name: "create_booking",
    description:
      "Creates a real appointment booking. Only call this after the customer has confirmed the branch, service, date/time slot, " +
      "and provided their name and phone number. Never tell the customer a booking is confirmed until this tool call succeeds.",
    parameters: {
      type: "object",
      properties: {
        branch_id: { type: "string", description: "Branch UUID" },
        service_id: { type: "string", description: "Service UUID" },
        slot_start: { type: "string", description: "ISO 8601 datetime for the appointment start" },
        full_name: { type: "string", description: "Patient full name" },
        phone: { type: "string", description: "Patient phone number" },
        doctor_id: { type: "string", description: "Optional doctor UUID" },
        complaint: { type: "string", description: "Optional reason for visit / chief complaint (non-diagnostic, as told by patient)" },
      },
      required: ["branch_id", "service_id", "slot_start", "full_name", "phone"],
    },
  },
  {
    name: "reschedule_booking",
    description: "Reschedules an existing appointment to a new slot. Only call after the customer confirms the new time.",
    parameters: {
      type: "object",
      properties: {
        appointment_id: { type: "string", description: "Appointment UUID to reschedule" },
        new_slot_start: { type: "string", description: "ISO 8601 datetime for the new appointment start" },
      },
      required: ["appointment_id", "new_slot_start"],
    },
  },
  {
    name: "cancel_booking",
    description: "Cancels an existing appointment. Only call after the customer explicitly confirms cancellation.",
    parameters: {
      type: "object",
      properties: {
        appointment_id: { type: "string", description: "Appointment UUID to cancel" },
        reason: { type: "string", description: "Optional cancellation reason" },
      },
      required: ["appointment_id"],
    },
  },
  {
    name: "handoff_to_human",
    description:
      "Hands the conversation off to a human staff member and stops the AI from replying further this turn. " +
      "Call this when: the customer explicitly asks for a human, the request needs medical judgment/diagnosis, " +
      "you are not confident you can help safely, or any other situation outside your scope.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Short reason for the handoff" },
      },
      required: ["reason"],
    },
  },
];

async function auditLog(
  supabase: SupabaseClient,
  trustedContext: TrustedContext,
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  success: boolean,
  errorMessage?: string,
) {
  try {
    const { error } = await supabase.from("ai_tool_audit_log").insert({
      tenant_id: trustedContext.tenant_id,
      conversation_id: trustedContext.conversation_id,
      tool_name: toolName,
      arguments: args,
      result: result ?? null,
      success,
      error_message: errorMessage ?? null,
    });
    if (error) {
      console.error(`[ai-tools] audit log insert failed for tool=${toolName}:`, error);
    }
  } catch (err) {
    console.error(`[ai-tools] audit log insert threw for tool=${toolName}:`, err);
  }
}

export async function dispatchTool(
  supabase: SupabaseClient,
  toolCall: ToolCall,
  trustedContext: TrustedContext,
): Promise<{ result: unknown; success: boolean; error?: string }> {
  // Strip any model-supplied tenant_id/branch_id -- never trusted.
  const args = { ...toolCall.args };
  delete (args as Record<string, unknown>).tenant_id;
  delete (args as Record<string, unknown>).branch_id;

  let result: unknown = null;
  let success = false;
  let error: string | undefined;

  try {
    switch (toolCall.name) {
      case "get_clinic_info": {
        const { data, error: rpcError } = await supabase.rpc("public_booking_options_for_tenant", {
          p_tenant_id: trustedContext.tenant_id,
        });
        if (rpcError) { error = rpcError.message; break; }
        result = data;
        success = true;
        break;
      }

      case "check_available_slots": {
        const branchId = (toolCall.args.branch_id as string) ?? trustedContext.branch_id;
        if (!branchId) { error = "branch_id is required and could not be determined."; break; }
        const { data, error: rpcError } = await supabase.rpc("public_booking_slots_for_tenant", {
          p_tenant_id: trustedContext.tenant_id,
          p_branch_id: branchId,
          p_service_id: toolCall.args.service_id,
          p_date: toolCall.args.date,
          p_doctor_id: toolCall.args.doctor_id ?? null,
        });
        if (rpcError) { error = rpcError.message; break; }
        result = data;
        success = true;
        break;
      }

      case "find_patient_by_phone": {
        const branchId = trustedContext.branch_id;
        if (!branchId) {
          error = "No branch is associated with this conversation yet; ask the customer which branch first.";
          break;
        }
        const { data, error: rpcError } = await supabase.rpc("public_find_patient_by_phone_for_tenant", {
          p_tenant_id: trustedContext.tenant_id,
          p_branch_id: branchId,
          p_phone: toolCall.args.phone,
        });
        if (rpcError) { error = rpcError.message; break; }
        result = data;
        success = true;
        break;
      }

      case "create_booking": {
        const branchId = (toolCall.args.branch_id as string) ?? trustedContext.branch_id;
        if (!branchId) {
          error = "branch_id is missing and this conversation has no default branch. Ask the customer which branch they want before booking.";
          break;
        }
        const { data, error: rpcError } = await supabase.rpc("public_create_booking_for_tenant", {
          p_tenant_id: trustedContext.tenant_id,
          p_branch_id: branchId,
          p_service_id: toolCall.args.service_id,
          p_slot_start: toolCall.args.slot_start,
          p_full_name: toolCall.args.full_name,
          p_phone: toolCall.args.phone,
          p_doctor_id: toolCall.args.doctor_id ?? null,
          p_email: toolCall.args.email ?? null,
          p_complaint: toolCall.args.complaint ?? null,
          p_source: "whatsapp_ai",
          p_metadata: { conversation_id: trustedContext.conversation_id },
        });
        if (rpcError) { error = rpcError.message; break; }
        result = data;
        success = true;
        break;
      }

      case "reschedule_booking": {
        const { data, error: rpcError } = await supabase.rpc("public_reschedule_appointment_for_tenant", {
          p_tenant_id: trustedContext.tenant_id,
          p_appointment_id: toolCall.args.appointment_id,
          p_new_slot_start: toolCall.args.new_slot_start,
        });
        if (rpcError) { error = rpcError.message; break; }
        result = data;
        success = true;
        break;
      }

      case "cancel_booking": {
        const { data, error: rpcError } = await supabase.rpc("public_cancel_appointment_for_tenant", {
          p_tenant_id: trustedContext.tenant_id,
          p_appointment_id: toolCall.args.appointment_id,
          p_reason: toolCall.args.reason ?? null,
        });
        if (rpcError) { error = rpcError.message; break; }
        result = data;
        success = true;
        break;
      }

      case "handoff_to_human": {
        const reason = (toolCall.args.reason as string) || "AI requested human handoff";
        const { error: updateError } = await supabase
          .from("conversations")
          .update({
            status: "human_active",
            handoff_reason: reason,
            handoff_at: new Date().toISOString(),
          })
          .eq("id", trustedContext.conversation_id);
        if (updateError) { error = updateError.message; break; }
        result = { handed_off: true, reason };
        success = true;
        break;
      }

      default: {
        error = `Unknown tool: ${toolCall.name}`;
        break;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  await auditLog(supabase, trustedContext, toolCall.name, args, result, success, error);

  return { result: result ?? { error }, success, error };
}
