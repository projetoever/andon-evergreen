import { Globe2 } from "lucide-react";
import { LANGUAGE_OPTIONS, useLanguage, type AndonLanguage } from "@/i18n/LanguageProvider";

export function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <label className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-muted-foreground">
      <Globe2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t("Idioma da interface")}</span>
      <select
        aria-label={t("Idioma da interface")}
        title={t("Idioma da interface")}
        value={language}
        onChange={(event) => setLanguage(event.target.value as AndonLanguage)}
        className="min-w-0 max-w-[94px] cursor-pointer bg-transparent text-xs font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[110px]"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
