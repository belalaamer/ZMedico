const examples: Record<string, [string, string]> = {
  patient_name: ["مريض تجريبي", "Demo patient"],
  patient_name_ar: ["مريض تجريبي", "مريض تجريبي"],
  clinic_name: ["عيادة تجريبية", "Demo clinic"],
  doctor_name: ["طبيب تجريبي", "Demo doctor"],
  branch_name: ["الفرع التجريبي", "Demo branch"],
  branch_name_ar: ["الفرع التجريبي", "الفرع التجريبي"],
  invoice_number: ["DEMO-001", "DEMO-001"],
  total: ["100.00", "100.00"],
  remaining: ["50.00", "50.00"],
  amount: ["50.00", "50.00"],
  patient_portal_username: ["demo_patient", "demo_patient"],
  patient_portal_password: ["[كلمة مرور تجريبية]", "[demo password]"],
  patient_portal_url: ["https://example.invalid/portal", "https://example.invalid/portal"],
  support_contact: ["[رقم الدعم التجريبي]", "[demo support contact]"],
  appointment_date: ["20/10/2026", "20/10/2026"],
  appointment_time: ["10:00 صباحًا", "10:00 AM"],
};

// Plain text only: never execute template HTML or interpolate real patient data.
export function templatePreview(body: string, lang: "ar" | "en") {
  const unknown = new Set<string>();
  const text = body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (token, raw: string) => {
    const key = raw.trim();
    if (Object.prototype.hasOwnProperty.call(examples, key)) return examples[key][lang === "ar" ? 0 : 1];
    unknown.add(key);
    return token;
  });
  return { text, unknown: [...unknown] };
}
