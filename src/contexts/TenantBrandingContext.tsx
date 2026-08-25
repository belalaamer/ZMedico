import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TenantBranding = {
  tenant_id: string;
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  show_powered_by: boolean;
};

type BrandingContextValue = {
  branding: TenantBranding | null;
  loading: boolean;
  isBrandedTenantHost: boolean;
};

const BrandingContext = createContext<BrandingContextValue>({ branding: null, loading: false, isBrandedTenantHost: false });

function isPlatformHost(hostname: string) {
  return !hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".workers.dev") || hostname === "belalaamer.com" || hostname === "www.belalaamer.com";
}

export function TenantBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [loading, setLoading] = useState(false);
  const [isBrandedTenantHost, setIsBrandedTenantHost] = useState(false);

  useEffect(() => {
    let active = true;
    const hostname = typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();
    const brandedHost = !isPlatformHost(hostname);
    setIsBrandedTenantHost(brandedHost);
    if (!brandedHost) {
      setBranding(null);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    void supabase.rpc("get_public_tenant_branding" as never, { _hostname: hostname } as never)
      .then(({ data, error }) => {
        if (!active) return;
        const row = Array.isArray(data) ? data[0] : data;
        setBranding(error || !row ? null : row as TenantBranding);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setBranding(null);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.title = branding?.display_name || "ZMedico";
    return () => { document.title = "ZMedico"; };
  }, [branding]);

  useEffect(() => {
    const root = document.documentElement;
    if (!branding) {
      root.removeAttribute("data-tenant-branded");
      root.style.removeProperty("--tenant-brand-primary");
      root.style.removeProperty("--tenant-brand-secondary");
      root.style.removeProperty("--tenant-brand-accent");
      return;
    }
    root.setAttribute("data-tenant-branded", "true");
    root.style.setProperty("--tenant-brand-primary", branding.primary_color);
    root.style.setProperty("--tenant-brand-secondary", branding.secondary_color);
    root.style.setProperty("--tenant-brand-accent", branding.accent_color);
    return () => {
      root.removeAttribute("data-tenant-branded");
      root.style.removeProperty("--tenant-brand-primary");
      root.style.removeProperty("--tenant-brand-secondary");
      root.style.removeProperty("--tenant-brand-accent");
    };
  }, [branding]);

  const value = useMemo(() => ({ branding, loading, isBrandedTenantHost }), [branding, loading, isBrandedTenantHost]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useTenantBranding() {
  return useContext(BrandingContext);
}
