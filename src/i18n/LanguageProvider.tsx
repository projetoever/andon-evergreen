import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  LANGUAGE_STORAGE_KEY,
  DEFAULT_LANGUAGE,
  isAndonLanguage,
  type AndonLanguage,
} from "./language";
import { translateLabel, type MessageParams, type MessageContext } from "./translate";
import { localizeFormValidation } from "./validationMessages";
export {
  LANGUAGE_STORAGE_KEY,
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  isAndonLanguage,
  type AndonLanguage,
} from "./language";
export { translateLabel } from "./translate";

type LanguageContextValue = {
  language: AndonLanguage;
  setLanguage: (language: AndonLanguage) => void;
  t: (source: string, params?: MessageParams, context?: MessageContext) => string;
};

// Reusable status cards can also be rendered in isolated tests and previews.
const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (source) => source,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Start identically on server and client to avoid SSR hydration mismatch.
  const [language, updateLanguage] = useState<AndonLanguage>(DEFAULT_LANGUAGE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isAndonLanguage(saved)) {
        document.documentElement.lang = saved;
        updateLanguage(saved);
      }
    } catch {
      // Locked-down kiosk browsers may deny localStorage; Portuguese still works.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.lang = language;
    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) {
      document
        .querySelector(selector)
        ?.setAttribute(
          "content",
          translateLabel(
            language,
            "Sistema Andon industrial para acompanhar máquinas e chamados em tempo real.",
          ),
        );
    }
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Language remains usable for the current tab.
    }
  }, [language, hydrated]);

  useEffect(() => localizeFormValidation(language), [language]);

  const setLanguage = useCallback((next: AndonLanguage) => {
    if (isAndonLanguage(next)) {
      document.documentElement.lang = next;
      updateLanguage(next);
    }
  }, []);
  const t = useCallback(
    (source: string, params?: MessageParams, context?: MessageContext) =>
      translateLabel(language, source, params, context),
    [language],
  );
  const context = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <LanguageContext.Provider value={context}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
