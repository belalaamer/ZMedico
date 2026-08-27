import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
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
  const workspaceHandoff = isSystemOwnerWorkspaceHandoff(
    authzLoading ? false : authz.holdsAnyRole("system_owner"),
    `${pathname}${search}`,
    currentBranchId,
  );
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  // Resolve the platform/workspace boundary before mounting any workspace chrome.
  // This prevents a system owner from seeing a one-frame clinic dashboard/sidebar
  // while the role query is still loading.
  if (authzLoading || !branchSelectionReady) return <SubscriptionState loading lang={lang} />;
  if (authz.holdsAnyRole("system_owner") && !workspaceHandoff) return <Navigate to="/platform" replace />;
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
