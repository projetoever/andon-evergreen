import { systemMessage, ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Hash, Users } from "lucide-react";
import { toast } from "@/i18n/toast";

import { BigButton } from "@/components/common/BigButton";
import { cn } from "@/lib/utils";
import { getSystemSettings, updateSystemSettings } from "@/services/systemSettingsService";
import type { AttendanceMode, RfidInputTerminator, SystemSettings } from "@/types/systemSettings";

const MODE_OPTIONS: Array<{
  id: AttendanceMode;
  label: string;
  description: string;
  icon: typeof Users;
}> = [
  {
    id: "name",
    get label() {
      return ui("Seleção por nome");
    },
    get description() {
      return ui("Mantém a lista visual atual de mantenedores.");
    },
    icon: Users,
  },
  {
    id: "pin",
    get label() {
      return ui("Identificação por PIN");
    },
    get description() {
      return ui("O mantenedor informa seu código pessoal antes de iniciar.");
    },
    icon: Hash,
  },
  {
    id: "rfid",
    get label() {
      return ui("Identificação por tag RF");
    },
    get description() {
      return ui("Usa leitor USB/HID que envia o código como um teclado.");
    },
    icon: CreditCard,
  },
];

export function AttendanceModeSettingsTab() {
  useInterfaceLanguage();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const value = await getSystemSettings();
      setSettings(value);
      setSavedSettings(value);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : ui("Não foi possível carregar o modo de atendimento");
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const hasUnsavedChanges = useMemo(() => {
    if (!settings || !savedSettings) return false;

    return (
      settings.attendanceMode !== savedSettings.attendanceMode ||
      settings.rfidInputTerminator !== savedSettings.rfidInputTerminator ||
      settings.rfidCodeLength !== savedSettings.rfidCodeLength
    );
  }, [savedSettings, settings]);

  async function handleSave() {
    if (!settings || !hasUnsavedChanges) return;

    if (
      settings.rfidInputTerminator === "fixed_length" &&
      (!Number.isInteger(settings.rfidCodeLength) ||
        Number(settings.rfidCodeLength) < 4 ||
        Number(settings.rfidCodeLength) > 64)
    ) {
      toast.error("Informe entre 4 e 64 caracteres para a leitura RFID.");
      return;
    }

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
      setSavedSettings(saved);
      toast.success("Modo de atendimento salvo.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar o modo de atendimento",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{ui("Carregando configurações...")}</p>;
  }

  if (loadError || !settings) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger"
      >
        <div>
          <p className="font-black">{ui("Modo de atendimento indisponível")}</p>
          <p>
            {(loadError ? systemMessage(loadError) : null) ??
              ui("Não foi possível carregar as configurações.")}
          </p>
        </div>
        <button type="button" className="font-bold underline" onClick={() => void loadSettings()}>
          {ui("Tentar novamente")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold">{ui("Modo de atendimento")}</h3>
        <p className="text-sm text-muted-foreground">
          {ui("Defina como os responsáveis se identificam ao atender ou entrar em um chamado.")}
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
            <h4 className="font-bold">{ui("Leitor de tag")}</h4>
            <p className="text-sm text-muted-foreground">
              {ui(
                "Nesta etapa, o leitor deve operar como teclado USB/HID. Não é necessário instalar driver no ANDON.",
              )}
            </p>
          </div>
          <label className="block text-sm font-semibold">
            {ui("Final da leitura")}
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
              <option value="enter">{ui("Tecla Enter")}</option>
              <option value="tab">{ui("Tecla Tab")}</option>
              <option value="fixed_length">{ui("Quantidade fixa de caracteres")}</option>
            </select>
          </label>
          {settings.rfidInputTerminator === "fixed_length" && (
            <label className="block text-sm font-semibold">
              {ui("Quantidade de caracteres")}
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
            {ui(
              "O ícone de ajuda no atendimento sempre permite usar PIN caso a tag esteja indisponível.",
            )}
          </p>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <p
          className={
            hasUnsavedChanges
              ? "text-xs font-bold text-warning"
              : "text-xs font-bold text-muted-foreground"
          }
        >
          {hasUnsavedChanges ? ui("Alterações não salvas") : ui("Configuração sincronizada")}
        </p>

        <div className="flex flex-wrap gap-2">
          <BigButton
            tone="primary"
            size="md"
            onClick={() => void handleSave()}
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? ui("Salvando...") : ui("Salvar modo de atendimento")}
          </BigButton>
          <BigButton
            tone="neutral"
            size="md"
            onClick={() => savedSettings && setSettings(savedSettings)}
            disabled={isSaving || !hasUnsavedChanges}
          >
            {ui("Cancelar")}
          </BigButton>
        </div>
      </div>
    </div>
  );
}
