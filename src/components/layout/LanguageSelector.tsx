import { ui } from "@/i18n/translate";
import { Globe2 } from "lucide-react";
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
  return (
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
  );
}
