import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { dict, type Lang, type DictKey } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

type Ctx = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  t: (k: DictKey) => string;
};

const I18nContext = createContext<Ctx | null>(null);
const supportedLanguage = (value: unknown): value is Lang => value === "en" || value === "ar";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("zmedico.lang") : null;
      return supportedLanguage(stored) ? stored : "en";
    } catch { return "en"; }
  });
  const actor = useRef<string | null>(null);
  const identityVersion = useRef(0);
  const preferenceVersion = useRef(0);
  const live = useRef(false);
  const writes = useRef<Promise<void>>(Promise.resolve());

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try { localStorage.setItem("zmedico.lang", lang); } catch { /* Storage may be blocked; keep the UI usable. */ }
  }, [lang, dir]);

  // Load the language preference from the user's profile after sign-in so it
  // follows the user across devices. Falls back silently on any error.
  useEffect(() => {
    live.current = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const loadPreference = async (uid: string, identity: number, preference: number) => {
      try {
        const { data, error } = await supabase.from("profiles").select("preferred_lang").eq("id", uid).maybeSingle();
        if (!error && live.current && actor.current === uid && identityVersion.current === identity
            && preferenceVersion.current === preference && supportedLanguage(data?.preferred_lang)) {
          setLangState(data.preferred_lang);
        }
      } catch { /* A missing preference must not prevent login or rendering. */ }
    };
    const initialIdentity = identityVersion.current;
    const initialPreference = preferenceVersion.current;
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !live.current || identityVersion.current !== initialIdentity) return;
        actor.current = data.user?.id ?? null;
        if (actor.current) await loadPreference(actor.current, initialIdentity, initialPreference);
      } catch { /* Auth failures are handled by the authentication layer. */ }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "INITIAL_SESSION" && event !== "SIGNED_OUT") return;
      const uid = event === "SIGNED_OUT" ? null : session?.user.id ?? null;
      if (uid === actor.current && event !== "SIGNED_OUT") return;
      actor.current = uid;
      const identity = ++identityVersion.current;
      const preference = ++preferenceVersion.current;
      if (uid) {
        // Keep Supabase work out of the synchronous Auth event callback.
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (live.current && identityVersion.current === identity && preferenceVersion.current === preference) {
            void loadPreference(uid, identity, preference);
          }
        }, 0);
        timers.add(timer);
      }
    });
    return () => {
      live.current = false;
      identityVersion.current += 1;
      preferenceVersion.current += 1;
      timers.forEach(clearTimeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  const setLang = (l: Lang) => {
    if (!supportedLanguage(l)) return;
    const identity = identityVersion.current;
    const preference = ++preferenceVersion.current;
    const selectedActor = actor.current;
    setLangState(l);
    // Serialize writes and skip obsolete choices before starting a request.
    // Once a request is in flight it is not cancelled or automatically retried.
    writes.current = writes.current.then(async () => {
      const current = () => live.current && identityVersion.current === identity && preferenceVersion.current === preference;
      if (!current()) return;
      const { data, error } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (error || !uid || !current() || (selectedActor && uid !== selectedActor)
          || (actor.current && uid !== actor.current)) return;
      // zero-rows-ok — this write only mirrors onto the profile a language the
      // screen already applied and stored locally; nothing here claims "saved",
      // so a row the session cannot update changes no message and no state. The
      // rejection path keeps its existing console warning below.
      const { error: writeError } = await supabase.from("profiles").update({ preferred_lang: l }).eq("id", uid);
      if (writeError && current()) console.warn("Language preference could not be saved to the profile.");
    }).catch(() => { console.warn("Language preference persistence failed; local selection remains available."); });
  };
  const t = (k: DictKey) => (dict[lang] ?? dict.en)[k] ?? dict.en[k] ?? k;

  return <I18nContext.Provider value={{ lang, dir, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
