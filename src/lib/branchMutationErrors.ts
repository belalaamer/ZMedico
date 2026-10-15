export function branchMutationFailure(error: unknown, lang: string, operation: "archive" | "delete") {
  const ar = lang === "ar";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  let title: string;
  let description: string | undefined;
  if (code === "23514") {
    title = operation === "archive"
      ? (ar ? "لا يمكن أرشفة آخر فرع نشط" : "The final active branch cannot be archived")
      : (ar ? "لا يمكن حذف آخر فرع للعميل" : "The final branch cannot be deleted");
    description = ar ? "أنشئ أو فعّل فرعًا آخر أولًا، ثم أعد المحاولة." : "Create or activate another branch first, then retry.";
  } else if (["40001", "40P01", "55P03"].includes(code)) {
    title = ar ? "يوجد تعديل متزامن على الفروع" : "Another branch update is in progress";
    description = ar ? "حدّث القائمة وتحقق من حالة الفرع قبل إعادة المحاولة." : "Refresh the list and check the branch state before retrying.";
  } else if (code === "42501") {
    title = ar ? "ليس لديك صلاحية لتنفيذ هذه العملية" : "You do not have permission for this action";
  } else if (code === "P0002") {
    title = ar ? "الفرع غير موجود أو لم يعد متاحًا لك" : "The branch is missing or no longer accessible";
  } else {
    title = operation === "archive"
      ? (ar ? "تعذر أرشفة الفرع. حاول مرة أخرى." : "The branch could not be archived. Try again.")
      : (ar ? "تعذر تأكيد حذف الفرع" : "Unable to confirm branch deletion");
    description = ar ? "حدّث القائمة وتحقق من النتيجة قبل إعادة المحاولة." : "Refresh the list and verify the outcome before retrying.";
  }
  return { title, description, variant: "destructive" as const };
}
