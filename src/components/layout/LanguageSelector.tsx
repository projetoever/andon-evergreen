import { ui } from "@/i18n/translate";
import { Globe2, Moon, Sun } from "lucide-react";
import { useTheme } from "@/theme/ThemeProvider";
import { LANGUAGE_OPTIONS, useLanguage, type AndonLanguage } from "@/i18n/LanguageProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const toggleLabel = t(theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro");
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        aria-label={toggleLabel}
        aria-pressed={theme === "light"}
        title={toggleLabel}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
      </button>
      <Select value={language} onValueChange={(value) => setLanguage(value as AndonLanguage)}>
      <SelectTrigger
        aria-label={t("Idioma da interface")}
        title={t("Idioma da interface")}
        className={
          compact
            ? "h-9 w-9 shrink-0 justify-center border-border bg-card p-0 text-foreground [&>svg:last-child]:hidden"
            : "h-9 w-auto shrink-0 gap-1.5 border-border bg-card px-2 text-xs font-bold text-foreground"
        }
      >
        <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className={compact ? "sr-only" : undefined}>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent align="end" className="border-border bg-card text-card-foreground">
        {LANGUAGE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
      </Select>
    </div>
  );
}
