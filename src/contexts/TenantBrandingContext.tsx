import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BrandingSource = "zmedico" | "tenant";

const ZMEDICO_DEFAULTS = {
  display_name: "ZMedico",
  logo_url: null,
  favicon_url: null,
  primary_color: "#3a1a5e",
  secondary_color: "#6d3bb3",
  accent_color: "#d7b86e",
} as const;

export type TenantBranding = {
  tenant_id: string;
  display_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  show_powered_by: boolean;
  display_name_source: BrandingSource;
  logo_source: BrandingSource;
  favicon_source: BrandingSource;
  colors_source: BrandingSource;
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

  const effectiveBranding = useMemo(() => {
    if (!branding) return null;
    return {
      ...branding,
      display_name: branding.display_name_source === "zmedico" ? ZMEDICO_DEFAULTS.display_name : branding.display_name,
      logo_url: branding.logo_source === "zmedico" ? ZMEDICO_DEFAULTS.logo_url : branding.logo_url,
      favicon_url: branding.favicon_source === "zmedico" ? ZMEDICO_DEFAULTS.favicon_url : branding.favicon_url,
      primary_color: branding.colors_source === "zmedico" ? ZMEDICO_DEFAULTS.primary_color : branding.primary_color,
      secondary_color: branding.colors_source === "zmedico" ? ZMEDICO_DEFAULTS.secondary_color : branding.secondary_color,
      accent_color: branding.colors_source === "zmedico" ? ZMEDICO_DEFAULTS.accent_color : branding.accent_color,
    };
  }, [branding]);

  useEffect(() => {
    document.title = effectiveBranding?.display_name || "ZMedico";
    return () => { document.title = "ZMedico"; };
  }, [effectiveBranding]);

  useEffect(() => {
    const existing = document.head.querySelector<HTMLLinkElement>('link[data-tenant-favicon="true"]');
    const link = existing ?? document.head.appendChild(document.createElement("link"));
    link.setAttribute("data-tenant-favicon", "true");
    link.rel = "icon";
    const faviconUrl = effectiveBranding?.favicon_url?.toLowerCase() || "";
    link.type = faviconUrl.includes(".ico") ? "image/x-icon" : faviconUrl.includes(".svg") ? "image/svg+xml" : faviconUrl.includes(".webp") ? "image/webp" : "image/png";
    if (effectiveBranding?.favicon_url) {
      link.href = effectiveBranding.favicon_url;
    } else {
      link.removeAttribute("href");
    }
    return () => {
      link.remove();
    };
  }, [effectiveBranding?.favicon_url]);

  useEffect(() => {
    const root = document.documentElement;
    if (!effectiveBranding) {
      root.removeAttribute("data-tenant-branded");
      root.style.removeProperty("--tenant-brand-primary");
      root.style.removeProperty("--tenant-brand-secondary");
      root.style.removeProperty("--tenant-brand-accent");
      return;
    }
    root.setAttribute("data-tenant-branded", "true");
    root.style.setProperty("--tenant-brand-primary", effectiveBranding.primary_color);
    root.style.setProperty("--tenant-brand-secondary", effectiveBranding.secondary_color);
    root.style.setProperty("--tenant-brand-accent", effectiveBranding.accent_color);
    return () => {
      root.removeAttribute("data-tenant-branded");
      root.style.removeProperty("--tenant-brand-primary");
      root.style.removeProperty("--tenant-brand-secondary");
      root.style.removeProperty("--tenant-brand-accent");
    };
  }, [effectiveBranding]);

  const value = useMemo(() => ({ branding: effectiveBranding, loading, isBrandedTenantHost }), [effectiveBranding, loading, isBrandedTenantHost]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useTenantBranding() {
  return useContext(BrandingContext);
}
