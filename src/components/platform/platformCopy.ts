import { useI18n } from "@/contexts/I18nContext";

/**
 * One bilingual table for the platform console. Every entry is [ar, en]; the parity test
 * in platformCopy.test.ts fails if a row loses a language, so an Arabic screen can never
 * fall back to an English sentence. Identifiers (slugs, table names, codes) stay Latin and
 * are rendered in their own element, never inside these strings.
 */
const STRINGS = {
  eyebrow: ["إدارة المنصة", "Platform administration"],
  title: ["العيادات ومساحات التشغيل", "Clinics & workspaces"],
  lead: [
    "اختر مساحة التشغيل أولًا، ثم ادخل إليها صراحةً. الأرشفة توقف الدخول وتحفظ البيانات، والحذف النهائي لا يمسّ السجلات المالية أو الطبية.",
    "Choose a workspace first, then enter it explicitly. Archiving closes access and keeps the data; permanent deletion never touches financial or clinical records.",
  ],
  addClinic: ["إضافة عيادة", "Add clinic"],
  kpiLive: ["مساحات قائمة", "Live workspaces"],
  kpiLiveHint: ["كل مساحة غير مؤرشفة", "Every workspace that is not archived"],
  kpiActive: ["اشتراك نشط", "Active subscription"],
  kpiActiveHint: ["مفعّلة وليست ملغاة أو منتهية", "Enabled, not cancelled or expired"],
  kpiReview: ["يحتاج مراجعة", "Needs review"],
  kpiReviewHint: ["متأخر السداد، بلا خطة، أو تنتهي خلال 7 أيام", "Past due, no plan, or a term ending within 7 days"],
  kpiArchived: ["مؤرشفة", "Archived"],
  kpiArchivedHint: ["خارج الأرقام أعلاه، وقابلة للاستعادة", "Outside the figures above, and restorable"],
  tabLive: ["القائمة", "Live"],
  tabArchived: ["الأرشيف", "Archived"],
  searchPlaceholder: ["ابحث بالاسم أو المعرف", "Search by name or slug"],
  filterStatus: ["الحالة", "Status"],
  filterPlan: ["الخطة", "Plan"],
  statusAll: ["كل الحالات", "All statuses"],
  statusActive: ["نشط", "Active"],
  statusReview: ["يحتاج مراجعة", "Needs review"],
  planAll: ["كل الخطط", "All plans"],
  noPlan: ["بدون خطة", "No plan"],
  colWorkspace: ["مساحة التشغيل", "Workspace"],
  colPlan: ["الخطة", "Plan"],
  colStatus: ["الحالة", "Status"],
  colBranches: ["الفروع", "Branches"],
  colTerm: ["نهاية المدة", "Term ends"],
  colActions: ["إجراءات", "Actions"],
  colArchivedOn: ["تاريخ الأرشفة", "Archived on"],
  colArchiveReason: ["سبب الأرشفة", "Archive reason"],
  openWorkspace: ["فتح مساحة التشغيل", "Open workspace"],
  restore: ["استعادة", "Restore"],
  moreActions: ["إجراءات أخرى", "More actions"],
  health: ["الصحة التشغيلية", "Health"],
  modules: ["الوحدات", "Modules"],
  planTerm: ["الخطة والمدة", "Plan & term"],
  domains: ["الدومينات", "Domains"],
  branding: ["الهوية البصرية", "Branding"],
  archive: ["أرشفة", "Archive"],
  permanentDelete: ["حذف نهائي", "Permanent delete"],
  noTerm: ["بدون مدة محددة", "No term set"],
  until: ["حتى", "until"],
  termEnded: ["انتهت المدة", "Term ended"],
  noArchiveReason: ["بدون سبب مسجل", "No reason recorded"],
  archiveFirst: ["أرشف أولًا", "Archive first"],
  restoreNoBranches: [
    "لا يمكن استعادة مساحة بلا فروع. هذه المساحة ليس لها أي فرع مسجل.",
    "A workspace with no branches cannot be restored. This one has no branch on record.",
  ],
  archivedBadge: ["مؤرشفة", "Archived"],
  inactiveBadge: ["متوقفة", "Inactive"],
  emptyLiveTitle: ["لا توجد مساحات تشغيل بعد", "No workspaces yet"],
  emptyLiveBody: ["أنشئ أول عيادة من المعالج الذري ليظهر فرعها ومالكها هنا.", "Create the first clinic with the onboarding wizard; its branch and owner appear here."],
  emptyFilteredTitle: ["لا نتائج لهذه المرشحات", "No workspaces match these filters"],
  emptyFilteredBody: ["امسح البحث أو المرشحات لرؤية القائمة كاملة.", "Clear the search or the filters to see the whole list."],
  emptyFilteredAction: ["مسح المرشحات", "Clear filters"],
  emptyArchivedTitle: ["الأرشيف فارغ", "Nothing archived"],
  emptyArchivedBody: ["عند أرشفة مساحة تشغيل تظهر هنا مع سبب الأرشفة وإمكانية الاستعادة.", "Archived workspaces appear here with their reason and a way back."],
  loading: ["جارٍ تحميل مساحات التشغيل", "Loading workspaces"],
  loadErrorTitle: ["تعذر تحميل مساحات التشغيل", "Workspaces could not be loaded"],
  loadErrorBody: ["القائمة والأرقام أعلاه غير محدثة. أعد المحاولة قبل اتخاذ أي قرار.", "The list and the figures above are stale. Retry before acting on them."],
  retry: ["إعادة المحاولة", "Retry"],
  schemaPendingTitle: ["سجل الأرشفة غير مطبق بعد", "Archive ledger not applied yet"],
  schemaPendingBody: [
    "الاستعادة والحذف النهائي يتطلبان تطبيق ترحيل الأرشيف على قاعدة البيانات. القائمة تعمل الآن بالتعريف القديم (متوقفة + ملغاة أو منتهية).",
    "Restore and permanent delete need the archive migration applied to the database. The list is running on the legacy definition (inactive plus cancelled or expired).",
  ],
  noActiveBranchTitle: ["لا يوجد فرع نشط لهذه المساحة", "This workspace has no active branch"],
  noActiveBranchBody: ["أنشئ الفرع الأول أو استعد المساحة، ثم افتح مساحة التشغيل.", "Create its first branch or restore the workspace, then open it."],
  archiveTitle: ["أرشفة مساحة التشغيل", "Archive workspace"],
  archiveLead: [
    "سيتم إيقاف الدخول وتعطيل الفروع والدومينات، مع حفظ لقطة للحالة الحالية حتى يمكن استعادتها كما كانت.",
    "Access closes, branches and domains are disabled, and a snapshot of the current state is kept so it can be restored as it was.",
  ],
  archiveKeeps: [
    "لا يُحذف أي مريض أو موعد أو فاتورة أو دفعة. البيانات تبقى كاملة.",
    "No patient, appointment, invoice or payment is deleted. The data stays complete.",
  ],
  archiveReasonLabel: ["سبب الأرشفة (اختياري)", "Archive reason (optional)"],
  archiveReasonPlaceholder: ["مثال: انتهى تعاقد العيادة", "For example: the clinic contract ended"],
  confirmSlugLabel: ["اكتب معرف مساحة التشغيل للتأكيد", "Type the workspace slug to confirm"],
  cancel: ["إلغاء", "Cancel"],
  confirmArchive: ["تأكيد الأرشفة", "Confirm archive"],
  archiving: ["جارٍ الأرشفة", "Archiving"],
  archivedToast: ["تمت أرشفة مساحة التشغيل", "Workspace archived"],
  archiveFailed: ["تعذرت أرشفة مساحة التشغيل", "Workspace could not be archived"],
  restoreTitle: ["استعادة مساحة التشغيل", "Restore workspace"],
  restoreLead: [
    "تُعاد الفروع المختارة والدومينات ومدة الاشتراك إلى الحالة المسجلة وقت الأرشفة. لا تُلمس حالة الدومين عند مزود الخدمة.",
    "The chosen branches, domains and subscription term return to the state recorded at archive time. Provider-side domain state is left to the next domain check.",
  ],
  restoreNoSnapshotTitle: ["لا توجد لقطة مسجلة", "No recorded snapshot"],
  restoreNoSnapshot: [
    "هذه الأرشفة سابقة لسجل الاستعادة، فلا توجد حالة مسجلة. اختر الفروع وحالة الاشتراك صراحةً.",
    "This archive predates the restore ledger, so there is no recorded state. Choose the branches and the subscription status explicitly.",
  ],
  restoreNoBranchesTitle: ["لا فروع مسجلة", "No branches on record"],
  restoreBranches: ["الفروع التي تعود للعمل", "Branches to reactivate"],
  restoreBranchHint: ["المحدد مسبقًا هو ما كان نشطًا قبل الأرشفة.", "Pre-selected from what was active before the archive."],
  restoreStatus: ["حالة الاشتراك بعد الاستعادة", "Subscription status after restore"],
  restoreReasonLabel: ["سبب الاستعادة (اختياري)", "Restore reason (optional)"],
  restoreSelectionRequired: ["اختر فرعًا واحدًا على الأقل", "Select at least one branch"],
  restoreStatusRequired: ["اختر حالة الاشتراك", "Choose a subscription status"],
  confirmRestore: ["تأكيد الاستعادة", "Confirm restore"],
  restoring: ["جارٍ الاستعادة", "Restoring"],
  restoredToast: ["تمت استعادة مساحة التشغيل", "Workspace restored"],
  restoreFailed: ["تعذرت استعادة مساحة التشغيل", "Workspace could not be restored"],
  restoreAlreadyActive: ["هذه المساحة تعمل بالفعل", "This workspace is already live"],
  deleteTitle: ["حذف نهائي لمساحة التشغيل", "Permanently delete workspace"],
  deleteAssessing: ["جارٍ فحص ما يمكن حذفه", "Assessing what can be deleted"],
  deleteAssessFailed: ["تعذر فحص إمكانية الحذف", "The deletion assessment could not be run"],
  deleteNeedsArchive: [
    "الحذف النهائي متاح للمساحات المؤرشفة فقط. أرشف مساحة التشغيل أولًا.",
    "Permanent deletion is available for archived workspaces only. Archive it first.",
  ],
  deleteBlockedTitle: ["لا يمكن الحذف النهائي", "Permanent deletion is not possible"],
  deleteBlockedLead: [
    "هذه المساحة تحمل بيانات لا يمسحها الحذف النهائي. أرشفها بدلًا من ذلك، أو أزل السبب المذكور ثم أعد الفحص.",
    "This workspace holds data that permanent deletion never erases. Archive it instead, or clear the reason below and assess again.",
  ],
  deleteBlockersTitle: ["ما يحجب الحذف", "What blocks deletion"],
  deleteBlockerUnknownRows: ["غير مقاس", "not measured"],
  deleteReassess: ["إعادة الفحص", "Assess again"],
  deleteOpenDomains: ["فتح الدومينات", "Open domains"],
  deleteDeletableTitle: ["يمكن الحذف النهائي", "This workspace can be permanently deleted"],
  deleteDeletableLead: [
    "سيُحذف ما يلي نهائيًا ولا يمكن استرجاعه. السجلات المالية والطبية وسجلات التدقيق غير موجودة هنا، وإلا لظهر الحذف محجوبًا.",
    "The following is erased for good and cannot be recovered. Financial, clinical and audit records are absent here; if any existed, deletion would be blocked.",
  ],
  deleteErasedTitle: ["سيُحذف", "Will be erased"],
  deleteSurvivorsTitle: ["يبقى محفوظًا", "Kept on purpose"],
  deleteSurvivorsLead: [
    "سجلات التدقيق وسجل تغييرات المنصة تبقى بعد الحذف، وتُنقل إلى سجل الحذف الدائم.",
    "Audit trails and the platform change log survive the deletion and are moved into the permanent-deletion ledger.",
  ],
  deleteWalk: ["جداول مقاسة", "tables measured"],
  deleteEdges: ["علاقات مفحوصة", "relationships walked"],
  deleteWalkStopped: [
    "توقف الفحص عند الحد الأقصى للعمق، لذلك الحذف محجوب احتياطًا.",
    "The walk hit its depth limit, so deletion is blocked as a precaution.",
  ],
  deleteConfirmLabel: ["اكتب المعرف تمامًا كما هو ظاهر للتأكيد", "Type the slug exactly as shown to confirm"],
  deleteReasonLabel: ["سبب الحذف (اختياري)", "Deletion reason (optional)"],
  deleteIrreversible: [
    "لا توجد نسخة احتياطية تلقائية لهذا الإجراء. صدّر ما تحتاجه قبل الحذف.",
    "There is no automatic backup for this action. Export anything you need first.",
  ],
  deleteConfirmMismatch: [
    "المعرف المكتوب لا يطابق معرف مساحة التشغيل. اكتبه كما هو ظاهر تمامًا.",
    "The slug you typed does not match this workspace. Type it exactly as shown.",
  ],
  deleteDrift: [
    "تغيّرت البيانات أثناء الحذف، فأُلغي الإجراء بالكامل ولم يُحذف أي صف. أعد الفحص ثم حاول مرة أخرى.",
    "The data changed during deletion, so the whole operation was rolled back and no row was deleted. Assess again, then retry.",
  ],
  confirmDelete: ["احذف نهائيًا", "Delete permanently"],
  deleting: ["جارٍ الحذف", "Deleting"],
  deletedToast: ["تم الحذف النهائي", "Workspace permanently deleted"],
  deleteFailed: ["تعذر الحذف النهائي", "Permanent deletion failed"],
  deleteReceiptTitle: ["إيصال الحذف", "Deletion receipt"],
  deleteReceiptId: ["رقم الإيصال", "Receipt id"],
  deleteKeptChangeLog: ["صفوف سجل التغييرات محفوظة", "change-log rows kept"],
  close: ["إغلاق", "Close"],
  subscriptionTrial: ["تجربة", "Trial"],
  subscriptionActive: ["نشط", "Active"],
  subscriptionPastDue: ["متأخر السداد", "Past due"],
  subscriptionCancelled: ["ملغى", "Cancelled"],
  subscriptionExpired: ["منتهٍ", "Expired"],
  modulesTitle: ["وحدات مساحة التشغيل", "Workspace modules"],
  modulesLoading: ["جارٍ تحميل إعدادات الوحدات", "Loading module settings"],
  modulesReadFailedTitle: ["تعذر قراءة الإعدادات المحفوظة", "Saved settings could not be read"],
  modulesLoadFailed: [
    "القيم الظاهرة الآن هي الافتراضية، وحفظها سيستبدل ما هو محفوظ لهذه المساحة.",
    "The values shown are the defaults; saving will replace what is stored for this workspace.",
  ],
  modulesSaveFailed: ["تعذر حفظ الوحدات", "Modules could not be saved"],
  modulesSaved: ["تم حفظ الوحدات", "Modules saved"],
  modulesSave: ["حفظ الوحدات", "Save modules"],
  moduleNotInPlan: ["غير متاحة في الخطة الحالية", "Not included in this plan"],
  moduleAlwaysOn: ["وحدة أساسية لا تُغلق", "Core module, always on"],
  subscriptionTitle: ["الخطة والمدة", "Plan & term"],
  subscriptionChoosePlan: ["اختر الخطة", "Choose a plan"],
  subscriptionDuration: ["المدة بالأيام", "Term length (days)"],
  subscriptionDurationInvalid: ["المدة يجب أن تكون بين يوم و3650 يومًا", "Term must be between 1 and 3650 days"],
  subscriptionBilling: ["دورة الفوترة", "Billing cycle"],
  billingMonthly: ["شهري", "Monthly"],
  billingYearly: ["سنوي", "Yearly"],
  subscriptionNoTerm: [
    "لا توجد مدة محفوظة لهذه المساحة. أدخل عدد الأيام صراحةً قبل الحفظ؛ لن نفترض 30 يومًا تلقائيًا.",
    "No saved term exists for this workspace. Enter the number of days explicitly; we will not assume 30 days automatically.",
  ],
  subscriptionTermNote: [
    "عند انتهاء المدة أو أرشفة المساحة، يُغلق الدخول ولا تُحذف البيانات.",
    "When the term ends or the workspace is archived, access closes and no data is deleted.",
  ],
  subscriptionSave: ["حفظ التغيير", "Save change"],
  subscriptionSaved: ["تم تحديث الخطة والمدة", "Plan and term updated"],
  subscriptionSaveFailed: ["تعذر تحديث الاشتراك", "The subscription could not be updated"],
  saving: ["جارٍ الحفظ", "Saving"],
  changeLogSubscription: ["تم تحديث خطة ومدة الاشتراك", "Subscription plan and term updated"],
  changeLogModules: ["تم تحديث وحدات مساحة التشغيل", "Workspace modules updated"],
  platformControlsTitle: ["نطاق هذه الشاشة", "What this screen owns"],
  platformControlsBody: [
    "إنشاء العيادة، الوحدات، الدومينات، الخطط والأسعار، ودورة حياة مساحة التشغيل. إعدادات التشغيل اليومية تبقى داخل مساحة العيادة.",
    "Clinic creation, modules, domains, plans and pricing, and the workspace lifecycle. Daily operational settings stay inside the clinic workspace.",
  ],
  accessTitle: ["هذه الشاشة لمالك النظام فقط", "System Owner access required"],
  accessBody: ["يُمنع الوصول حتى لو كُتب الرابط يدويًا.", "Access is denied even if the URL is entered manually."],
} as const;

export type PlatformCopyKey = keyof typeof STRINGS;

export function platformText(key: PlatformCopyKey, isAr: boolean): string {
  return STRINGS[key][isAr ? 0 : 1];
}

export function usePlatformCopy() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  return { isAr, lang, tx: (key: PlatformCopyKey) => platformText(key, isAr) };
}

/** Arabic counts nouns differently at 1, 2, 3–10 and above 10. */
export function branchCountLabel(count: number, isAr: boolean): string {
  if (!isAr) return count === 1 ? "1 branch" : `${count} branches`;
  if (count === 0) return "لا فروع";
  if (count === 1) return "فرع واحد";
  if (count === 2) return "فرعان";
  if (count <= 10) return `${count} فروع`;
  return `${count} فرعًا`;
}

/** The deletion engine counts rows; the operator reads a counted noun, not "3 rows" in Arabic. */
export function rowCountLabel(count: number, isAr: boolean): string {
  if (!isAr) return count === 1 ? "1 row" : `${count} rows`;
  if (count === 0) return "لا صفوف";
  if (count === 1) return "صف واحد";
  if (count === 2) return "صفّان";
  if (count <= 10) return `${count} صفوف`;
  return `${count} صفًا`;
}

export function subscriptionLabel(status: string, isAr: boolean): string {
  const key = `subscription${status.charAt(0).toUpperCase()}${status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}` as PlatformCopyKey;
  return key in STRINGS ? platformText(key, isAr) : status;
}

/**
 * Platform and finance surfaces read Western digits in both languages, so the columns line
 * up and the Arabic console never mixes numeral systems inside one figure. `ar-EG-u-nu-latn`
 * is the same locale override src/lib/clinicTime.ts already uses.
 */
export function platformDate(value: string | null | undefined, isAr: boolean): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(isAr ? "ar-EG-u-nu-latn" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

/** Whole days until a term ends. Negative means it already ended; the caller says that. */
export function daysLeftLabel(days: number, isAr: boolean): string {
  if (!isAr) return days === 0 ? "ends today" : days === 1 ? "1 day left" : `${days} days left`;
  if (days === 0) return "ينتهي اليوم";
  if (days === 1) return "يوم واحد متبقٍ";
  if (days === 2) return "يومان متبقيان";
  if (days <= 10) return `${days} أيام متبقية`;
  return `${days} يومًا متبقيًا`;
}

export function daysUntil(value: string, now = Date.now()): number {
  return Math.ceil((new Date(value).getTime() - now) / 86_400_000);
}

export const PLATFORM_COPY_KEYS = Object.keys(STRINGS) as PlatformCopyKey[];
export const PLATFORM_COPY_ROWS = STRINGS;
