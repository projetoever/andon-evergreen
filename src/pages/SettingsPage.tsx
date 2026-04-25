import { SettingsPanel } from "@/components/settings/SettingsPanel";

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-3xl font-bold uppercase tracking-wider text-foreground">
        Configurações
      </h2>
      <SettingsPanel />
    </div>
  );
}
