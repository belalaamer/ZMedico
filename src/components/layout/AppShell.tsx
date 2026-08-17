import { Outlet } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function AppShell() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);
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