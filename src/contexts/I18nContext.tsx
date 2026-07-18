import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { dict, type Lang, type DictKey } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

type Ctx = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  t: (k: DictKey) => string;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("zmedico.lang")) as Lang | null;
    return stored ?? "en";
  });

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    localStorage.setItem("zmedico.lang", lang);
  }, [lang, dir]);

  // Load the language preference from the user's profile after sign-in so it
  // follows the user across devices. Falls back silently on any error.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: p } = await (supabase as any)
        .from("profiles")
        .select("preferred_lang")
        .eq("id", uid)
        .maybeSingle();
      const remote = p?.preferred_lang as Lang | null | undefined;
      if (!cancelled && remote && remote !== lang) setLangState(remote);
    };
    void sync();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") void sync();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    // Persist to the profile so other devices pick it up on next sign-in.
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      await (supabase as any).from("profiles").update({ preferred_lang: l }).eq("id", uid);
    })();
  };
  const t = (k: DictKey) => dict[lang][k] ?? dict.en[k] ?? k;

  return <I18nContext.Provider value={{ lang, dir, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}