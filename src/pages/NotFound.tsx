import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useI18n } from "@/contexts/I18nContext";

const NotFound = () => {
  const { lang } = useI18n();
  const location = useLocation();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const ar = lang === "ar";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-2 text-xl text-muted-foreground">
          {ar ? "لا توجد صفحة به هذا العنوان" : "There is no page at this address"}
        </p>
        <p className="mb-6 break-all font-mono text-sm text-muted-foreground/80">{location.pathname}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link to="/" className="text-primary underline hover:text-primary/90">
            {ar ? "العودة إلى لوحة العمل" : "Return to the workspace"}
          </Link>
          <Link to="/patient-portal/login" className="text-primary underline hover:text-primary/90">
            {ar ? "دخول المرضى" : "Patient portal sign in"}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
