import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const THEME_STORAGE_KEY = "andon.theme.v1";
export type AndonTheme = "dark" | "light";
export const DEFAULT_THEME: AndonTheme = "dark";

export function parseAndonTheme(value: unknown): AndonTheme {
  return value === "light" ? "light" : DEFAULT_THEME;
}

type ThemeContextValue = {
  theme: AndonTheme;
  setTheme: (theme: AndonTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

function applyTheme(theme: AndonTheme) {
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR and first client render must agree. Existing kiosks remain dark.
  const [theme, updateTheme] = useState<AndonTheme>(DEFAULT_THEME);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = parseAndonTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
      updateTheme(saved);
      applyTheme(saved);
    } catch {
      // Storage may be disabled in a locked-down kiosk: retain dark theme.
      applyTheme(DEFAULT_THEME);
    }
    setHydrated(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        updateTheme(parseAndonTheme(event.newValue));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The visual choice works in memory for the current tab.
    }
  }, [theme, hydrated]);

  const setTheme = useCallback((next: AndonTheme) => {
    if (next !== "dark" && next !== "light") return;
    updateTheme(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
