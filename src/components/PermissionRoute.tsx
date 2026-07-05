import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { moduleForPath } from "@/lib/rolePermissions";
import { useI18n } from "@/contexts/I18nContext";
import { ShieldAlert } from "lucide-react";

/**
 * Gates a route element based on the user's permission for the module
 * inferred from the current path. Admin always passes.
 */
export function PermissionRoute({ children, module, adminOnly }: { children: ReactNode; module?: string; adminOnly?: boolean }) {
  const { pathname } = useLocation();
  const { authz, loading } = useAuthorization();
  const { lang } = useI18n();
  const mod = module ?? moduleForPath(pathname);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="size-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (adminOnly) {
    if (authz.isSuperAdmin()) return <>{children}</>;
  } else if (authz.isSuperAdmin()) {
    return <>{children}</>;
  } else if (mod && authz.can(`${mod}.view`)) {
    // Deny by default: unmapped protected routes never fall through.
    return <>{children}</>;
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto size-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <ShieldAlert className="size-7" />
        </div>
        <h2 className="text-xl font-bold">
          {lang === "ar" ? "لا تملك صلاحية الوصول" : "Access denied"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {lang === "ar"
            ? "ليس لديك إذن لعرض هذه الصفحة. تواصل مع المسؤول إذا كنت تعتقد أن هذا خطأ."
            : "You don't have permission to view this page. Contact your administrator if you think this is a mistake."}
        </p>
      </div>
    </div>
  );
}