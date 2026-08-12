import { useEffect, useState } from "react";
import { CreditCard, Hash, Users } from "lucide-react";
import { toast } from "sonner";

import { BigButton } from "@/components/common/BigButton";
import { cn } from "@/lib/utils";
import { getSystemSettings, updateSystemSettings } from "@/services/systemSettingsService";
import type {
  AttendanceMode,
  RfidInputTerminator,
  SystemSettings,
} from "@/types/systemSettings";

const MODE_OPTIONS: Array<{
  id: AttendanceMode;
  label: string;
  description: string;
  icon: typeof Users;
}> = [
  {
    id: "name",
    label: "Seleção por nome",
    description: "Mantém a lista visual atual de mantenedores.",
    icon: Users,
  },
  {
    id: "pin",
    label: "Identificação por PIN",
    description: "O mantenedor informa seu código pessoal antes de iniciar.",
    icon: Hash,
  },
  {
    id: "rfid",
    label: "Identificação por tag RF",
    description: "Usa leitor USB/HID que envia o código como um teclado.",
    icon: CreditCard,
  },
];

export function AttendanceModeSettingsTab() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getSystemSettings()
      .then((value) => active && setSettings(value))
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Não foi possível carregar o modo de atendimento"),
      )
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function handleSave() {
    if (!settings) return;
    setIsSaving(true);
    try {
      const saved = await updateSystemSettings({
        attendanceMode: settings.attendanceMode,
        rfidReaderMode: "keyboard_hid",
        rfidInputTerminator: settings.rfidInputTerminator,
        rfidCodeLength:
          settings.rfidInputTerminator === "fixed_length" ? settings.rfidCodeLength : null,
      });
      setSettings(saved);
      toast.success("Modo de atendimento salvo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o modo de atendimento");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando configurações...</p>;
  if (!settings) return <p className="text-sm text-danger">Configurações indisponíveis.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold">Modo de atendimento</h3>
        <p className="text-sm text-muted-foreground">
          Defina como os responsáveis se identificam ao atender ou entrar em um chamado.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = settings.attendanceMode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setSettings({ ...settings, attendanceMode: option.id })}
              className={cn(
                "min-h-32 rounded-xl border-2 p-4 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/40 hover:bg-accent",
              )}
            >
              <Icon className="mb-3 h-7 w-7 text-primary" />
              <p className="font-black">{option.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
            </button>
          );
        })}
      </div>

      {settings.attendanceMode === "rfid" && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <h4 className="font-bold">Leitor de tag</h4>
            <p className="text-sm text-muted-foreground">
              Nesta etapa, o leitor deve operar como teclado USB/HID. Não é necessário instalar driver no ANDON.
            </p>
          </div>
          <label className="block text-sm font-semibold">
            Final da leitura
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-2"
              value={settings.rfidInputTerminator}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  rfidInputTerminator: event.target.value as RfidInputTerminator,
                })
              }
            >
              <option value="enter">Tecla Enter</option>
              <option value="tab">Tecla Tab</option>
              <option value="fixed_length">Quantidade fixa de caracteres</option>
            </select>
          </label>
          {settings.rfidInputTerminator === "fixed_length" && (
            <label className="block text-sm font-semibold">
              Quantidade de caracteres
              <input
                type="number"
                min={4}
                max={64}
                className="mt-1 h-10 w-full rounded-md border bg-background px-2"
                value={settings.rfidCodeLength ?? 10}
                onChange={(event) =>
                  setSettings({ ...settings, rfidCodeLength: Number(event.target.value) })
                }
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            O ícone de ajuda no atendimento sempre permite usar PIN caso a tag esteja indisponível.
          </p>
        </section>
      )}

      <BigButton tone="primary" size="md" onClick={() => void handleSave()} disabled={isSaving}>
        {isSaving ? "Salvando..." : "Salvar modo de atendimento"}
      </BigButton>
    </div>
  );
}
