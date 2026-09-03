import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { isSystemOwnerWorkspaceHandoff } from "@/lib/platformWorkspace";

export default function AppShell() {
  const { pathname, search } = useLocation();
  const { authz, loading: authzLoading } = useAuthorization("workspace-shell");
  const { currentBranchId, branchSelectionReady, subscription, subscriptionLoading } = useBranch();
  const { lang } = useI18n();
  const { roles, loading: rolesLoading } = useUserRole();
  const workspaceHandoff = isSystemOwnerWorkspaceHandoff(
    authzLoading ? false : authz.holdsAnyRole("system_owner"),
    `${pathname}${search}`,
    currentBranchId,
  );
  const mainRef = useRef<HTMLElement>(null);

  // RBAC-11 fix: a patient-portal identity has zero rows in user_roles by
  // design (patient-portal-invite explicitly strips any role a generic
  // trigger might add -- it is not staff and must never receive clinic
  // operational access). Before this check, nothing anywhere in the routing
  // stack distinguished that from a genuine staff session: /workspace's
  // Dashboard route carries no PermissionRoute wrapper at all ("the
  // dashboard route is not permission-gated" per moduleForPath's own
  // comment), and this component's own guards only handled the
  // system_owner and subscription cases. A patient who signed in through
  // the shared /auth staff login (nothing there rejects a patient
  // credential either -- same auth.users pool, same form) landed straight
  // on the full clinic Dashboard shell: real branding, a "Branch" selector,
  // "New Appointment", "View all reports" -- everything a patient must
  // never see. Confirmed live via screenshot. This check is the
  // authoritative, route-level guard: any roleless session is resolved to
  // either the patient portal (if it holds an active patient_portal_accounts
  // row) or a plain "no access" message -- it never falls through to the
  // staff shell, regardless of how the session was created or which URL was
  // requested.
  const [patientPortalCheck, setPatientPortalCheck] = useState<{ done: boolean; active: boolean }>({ done: false, active: false });
  useEffect(() => {
    if (rolesLoading) return;
    if (roles.length > 0) { setPatientPortalCheck({ done: true, active: false }); return; }
    let active = true;
    supabase.rpc("patient_portal_password_state").then(({ data, error }) => {
      if (!active) return;
      setPatientPortalCheck({ done: true, active: !error && Boolean((data as { active?: boolean } | null)?.active) });
    }).catch(() => {
      if (active) setPatientPortalCheck({ done: true, active: false });
    });
    return () => { active = false; };
  }, [rolesLoading, roles.length]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  // Resolve the platform/workspace boundary before mounting any workspace chrome.
  // This prevents a system owner from seeing a one-frame clinic dashboard/sidebar
  // while the role query is still loading.
  if (authzLoading || !branchSelectionReady || rolesLoading || !patientPortalCheck.done) return <SubscriptionState loading lang={lang} />;
  if (authz.holdsAnyRole("system_owner") && !workspaceHandoff) return <Navigate to="/platform" replace />;
  if (roles.length === 0) {
    if (patientPortalCheck.active) return <Navigate to="/patient-portal" replace />;
    return <SubscriptionState
      lang={lang}
      title={lang === "ar" ? "لا تملك صلاحية الوصول إلى مساحة العمل" : "You do not have access to this workspace"}
      description={lang === "ar" ? "تواصل مع مسؤول العيادة إذا كنت تعتقد أن هذا خطأ." : "Contact your clinic administrator if you believe this is a mistake."}
    />;
  }
  if (currentBranchId && subscriptionLoading) return <SubscriptionState loading lang={lang} />;
  if (!authzLoading && currentBranchId && !subscription) {
    return <SubscriptionState
      lang={lang}
      title={lang === "ar" ? "تعذر التحقق من الاشتراك" : "Subscription verification unavailable"}
      description={lang === "ar" ? "تم إيقاف مساحة التشغيل مؤقتًا لحماية بيانات العيادة. حاول مرة أخرى بعد عودة اتصال قاعدة البيانات." : "The workspace is paused to protect clinic data. Try again when the database connection is available."}
    />;
  }
  if (!authzLoading && currentBranchId && subscription && !subscription.access_allowed) {
    return <SubscriptionState
      lang={lang}
      title={lang === "ar" ? "انتهت صلاحية الاشتراك" : "Subscription expired"}
      description={lang === "ar" ? "تواصل مع مسؤول المنصة لتجديد الخطة أو تفعيل مدة جديدة." : "Contact the platform administrator to renew the plan or activate a new period."}
    />;
  }

  return (
    <div className="h-dvh flex w-full bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 md:p-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] md:pb-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}

function SubscriptionState({ loading, lang, title, description }: { loading?: boolean; lang: "ar" | "en"; title?: string; description?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="max-w-md space-y-4 text-center">
        {loading ? <div className="mx-auto size-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" aria-hidden="true" /> : <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-600"><ShieldAlert className="size-7" /></div>}
        <h1 className="text-xl font-bold">{loading ? (lang === "ar" ? "جارٍ التحقق من الاشتراك…" : "Checking subscription…") : title}</h1>
        {!loading && description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}
