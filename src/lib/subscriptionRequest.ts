export type SubscriptionRequestDraft = {
  clinicName: string;
  ownerName: string;
  email: string;
  phone?: string;
  planId?: string;
  message?: string;
};

export type NormalizedSubscriptionRequest = {
  clinic_name: string;
  owner_name: string;
  email: string;
  phone: string | null;
  plan_id: string | null;
  message: string | null;
};

export type SubscriptionRequestValidationError = "clinic_name" | "owner_name" | "email" | "phone" | "message" | null;

export function validateSubscriptionRequest(draft: SubscriptionRequestDraft): SubscriptionRequestValidationError {
  if (draft.clinicName.trim().length < 2 || draft.clinicName.trim().length > 120) return "clinic_name";
  if (draft.ownerName.trim().length < 2 || draft.ownerName.trim().length > 120) return "owner_name";
  const email = draft.email.trim();
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "email";
  if ((draft.phone?.trim().length ?? 0) > 40) return "phone";
  if ((draft.message?.trim().length ?? 0) > 1000) return "message";
  return null;
}

export function normalizeSubscriptionRequest(draft: SubscriptionRequestDraft): NormalizedSubscriptionRequest {
  return {
    clinic_name: draft.clinicName.trim(),
    owner_name: draft.ownerName.trim(),
    email: draft.email.trim().toLowerCase(),
    phone: draft.phone?.trim() || null,
    plan_id: draft.planId?.trim() || null,
    message: draft.message?.trim() || null,
  };
}
