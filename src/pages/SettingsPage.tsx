import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export function SettingsPage() {
  useInterfaceLanguage();
  return (
    <div className="space-y-4">
      <h2 className="text-3xl font-bold uppercase tracking-wider text-foreground">
        {ui("Configurações")}
      </h2>
      <SettingsPanel />
    </div>
  );
}
