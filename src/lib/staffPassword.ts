// Every surface that writes a ZMedico password uses this floor: the patient
// portal and recovery screens already require 8, and the staff dialogs and the
// two admin Edge functions must agree with them or the screen's floor is
// cosmetic. Sign-in deliberately keeps its 6-character pre-check so accounts
// created under the old policy can still get in.
export const MIN_STAFF_PASSWORD_LENGTH = 8;

// An empty field means "generate one", so only a supplied value can be short.
// The Edge functions trim before storing; trimming here keeps the screen's
// answer identical to the server's for values with surrounding spaces.
export function staffPasswordTooShort(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length < MIN_STAFF_PASSWORD_LENGTH;
}

export function staffPasswordTooShortCopy(lang: string): string {
  return lang === "ar"
    ? `كلمة المرور يجب ألا تقل عن ${MIN_STAFF_PASSWORD_LENGTH} أحرف`
    : `Password must be at least ${MIN_STAFF_PASSWORD_LENGTH} characters`;
}

export function staffPasswordMinimumCopy(lang: string): string {
  return lang === "ar"
    ? `${MIN_STAFF_PASSWORD_LENGTH} أحرف على الأقل.`
    : `At least ${MIN_STAFF_PASSWORD_LENGTH} characters.`;
}
