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

export type SubscriptionRequestField = Exclude<SubscriptionRequestValidationError, null>;

/**
 * One sentence per rule the validator can return, keyed by the code itself so
 * adding a rule without its copy is a compile error rather than a page that
 * silently falls back to a generic "review the form".
 */
export const SUBSCRIPTION_REQUEST_FIELD_ERRORS: Record<SubscriptionRequestField, { en: string; ar: string }> = {
  clinic_name: {
    en: "Enter a clinic or center name between 2 and 120 characters.",
    ar: "أدخل اسم العيادة أو المركز بما بين حرفين و١٢٠ حرفًا.",
  },
  owner_name: {
    en: "Enter the owner or manager name between 2 and 120 characters.",
    ar: "أدخل اسم المسؤول أو المدير بما بين حرفين و١٢٠ حرفًا.",
  },
  email: {
    en: "That email address looks incomplete — check for a missing domain or a missing dot after it.",
    ar: "البريد الإلكتروني غير مكتمل — تحقق من اسم النطاق ومن وجود نقطة بعده.",
  },
  phone: {
    en: "The phone number must be 40 characters or fewer.",
    ar: "رقم الهاتف يجب ألا يزيد على ٤٠ حرفًا.",
  },
  message: {
    en: "Your message must be 1000 characters or fewer.",
    ar: "الرسالة يجب ألا تزيد على ١٠٠٠ حرف.",
  },
};

export function describeSubscriptionRequestFieldError(
  field: SubscriptionRequestField,
  arabic: boolean,
): string {
  return SUBSCRIPTION_REQUEST_FIELD_ERRORS[field][arabic ? "ar" : "en"];
}

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
