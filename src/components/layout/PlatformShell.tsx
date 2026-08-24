import { Building2, Globe, LogOut } from "lucide-react";
import { Link, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

export default function PlatformShell() {
  const { lang, setLang } = useI18n();
  const { user, signOut } = useAuth();
  const isAr = lang === "ar";

  return (
    <div className="min-h-dvh bg-background" dir={isAr ? "rtl" : "ltr"}>
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/platform" className="flex min-w-0 items-center gap-3" aria-label={isAr ? "منصة إدارة ZMedico" : "ZMedico platform administration"}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">ZMedico</span>
              <span className="block truncate text-xs text-muted-foreground">{isAr ? "منصة الإدارة" : "Platform administration"}</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-52 truncate text-xs text-muted-foreground sm:block">{user?.email}</span>
            <Button variant="ghost" size="icon" type="button" onClick={() => setLang(isAr ? "en" : "ar")} title={isAr ? "English" : "العربية"} aria-label={isAr ? "English" : "العربية"}>
              <Globe className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" type="button" onClick={() => void signOut()} title={isAr ? "تسجيل الخروج" : "Sign out"} aria-label={isAr ? "تسجيل الخروج" : "Sign out"}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto min-h-[calc(100dvh-4rem)] max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
