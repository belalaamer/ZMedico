import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { dict, type Lang, type DictKey } from "@/lib/i18n";

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
    return stored ?? "ar";
  });

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    localStorage.setItem("zmedico.lang", lang);
  }, [lang, dir]);

  const setLang = (l: Lang) => setLangState(l);
  const t = (k: DictKey) => dict[lang][k] ?? dict.en[k] ?? k;

  return <I18nContext.Provider value={{ lang, dir, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}