export type RxPreset = {
  label_en: string;
  label_ar: string;
  frequency_en: string;
  frequency_ar: string;
  timesPerDay: number;
};

// Practical defaults doctors reach for. Free-text override is always allowed.
export const RX_FREQ_PRESETS: RxPreset[] = [
  { label_en: "Once daily (OD)", label_ar: "مرة يومياً", frequency_en: "Once daily", frequency_ar: "مرة يومياً", timesPerDay: 1 },
  { label_en: "Twice daily (BID)", label_ar: "مرتان يومياً", frequency_en: "Twice daily", frequency_ar: "مرتان يومياً", timesPerDay: 2 },
  { label_en: "Three times daily (TID)", label_ar: "ثلاث مرات يومياً", frequency_en: "Three times daily", frequency_ar: "ثلاث مرات يومياً", timesPerDay: 3 },
  { label_en: "Four times daily (QID)", label_ar: "أربع مرات يومياً", frequency_en: "Four times daily", frequency_ar: "أربع مرات يومياً", timesPerDay: 4 },
  { label_en: "Every 8 hours", label_ar: "كل 8 ساعات", frequency_en: "Every 8 hours", frequency_ar: "كل 8 ساعات", timesPerDay: 3 },
  { label_en: "Every 12 hours", label_ar: "كل 12 ساعة", frequency_en: "Every 12 hours", frequency_ar: "كل 12 ساعة", timesPerDay: 2 },
  { label_en: "At bedtime", label_ar: "عند النوم", frequency_en: "At bedtime", frequency_ar: "عند النوم", timesPerDay: 1 },
  { label_en: "As needed (PRN)", label_ar: "عند الحاجة", frequency_en: "As needed", frequency_ar: "عند الحاجة", timesPerDay: 0 },
];

export const RX_INSTR_PRESETS: { en: string; ar: string }[] = [
  { en: "After meals", ar: "بعد الأكل" },
  { en: "Before meals", ar: "قبل الأكل" },
  { en: "With food", ar: "مع الطعام" },
  { en: "On empty stomach", ar: "على معدة فارغة" },
  { en: "Avoid driving", ar: "تجنب القيادة" },
];

export const RX_DOSAGE_PRESETS: { en: string; ar: string }[] = [
  { en: "1 tablet", ar: "قرص واحد" },
  { en: "2 tablets", ar: "قرصان" },
  { en: "1 capsule", ar: "كبسولة واحدة" },
  { en: "5 ml", ar: "5 مل" },
  { en: "10 ml", ar: "10 مل" },
  { en: "1 puff", ar: "بخة واحدة" },
];

// Calculate total quantity to dispense from frequency × duration.
export function calcQuantity(timesPerDay: number, durationDays: number, unitsPerDose = 1): number {
  if (!timesPerDay || !durationDays) return 0;
  return Math.max(1, Math.ceil(timesPerDay * durationDays * unitsPerDose));
}