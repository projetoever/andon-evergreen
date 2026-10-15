import { ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/i18n/toast";

import { BigButton } from "@/components/common/BigButton";
import { Switch } from "@/components/ui/switch";
import {
  getSystemSettings,
  isValidDashboardSoundMuteDuration,
  updateSystemSettings,
} from "@/services/systemSettingsService";
import { DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES } from "@/utils/dashboardSoundMuteUtils";

export function DashboardSoundMuteSettings() {
  useInterfaceLanguage();
  const [autoMuteEnabled, setAutoMuteEnabled] = useState(false);
  const [activeDurationMinutes, setActiveDurationMinutes] = useState(
    DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES,
  );
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(
    DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const settings = await getSystemSettings();
      setAutoMuteEnabled(settings.dashboardSoundAutoMuteTimerEnabled);
      setActiveDurationMinutes(settings.dashboardSoundActiveDurationMinutes);
      setTimerEnabled(settings.dashboardSoundMuteTimerEnabled);
      setDurationMinutes(settings.dashboardSoundMuteDurationMinutes);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : ui("Não foi possível carregar o ciclo automático do som.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSave() {
    if (
      !isValidDashboardSoundMuteDuration(activeDurationMinutes) ||
      !isValidDashboardSoundMuteDuration(durationMinutes)
    ) {
      toast.error("Informe tempos inteiros de pelo menos 1 minuto.");
      return;
    }

    setSaving(true);
    try {
      const settings = await updateSystemSettings({
        dashboardSoundAutoMuteTimerEnabled: autoMuteEnabled,
        dashboardSoundActiveDurationMinutes: activeDurationMinutes,
        dashboardSoundMuteTimerEnabled: timerEnabled,
        dashboardSoundMuteDurationMinutes: durationMinutes,
      });

      setAutoMuteEnabled(settings.dashboardSoundAutoMuteTimerEnabled);
      setActiveDurationMinutes(settings.dashboardSoundActiveDurationMinutes);
      setTimerEnabled(settings.dashboardSoundMuteTimerEnabled);
      setDurationMinutes(settings.dashboardSoundMuteDurationMinutes);
      toast.success("Ciclo automático do som do dashboard salvo.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o ciclo automático do som.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h4 className="text-sm font-bold uppercase tracking-wide text-foreground">
          {ui("Ciclo automático do alarme do dashboard")}
        </h4>
        <p className="text-sm text-muted-foreground">
          {ui(
            "Controle por quanto tempo o alarme permanece ativo e por quanto tempo fica silenciado. Esta regra vale somente para o Dashboard principal.",
          )}
        </p>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          <span>{systemMessage(loadError)}</span>
          <button
            type="button"
            className="font-bold underline"
            onClick={() => void loadSettings()}
            disabled={loading}
          >
            {ui("Tentar novamente")}
          </button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border bg-muted/10 p-3">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>
              <span className="block">{ui("Silenciar automaticamente após um período")}</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {ui("Conta o tempo enquanto o som está ativo e existe chamado aberto com alarme.")}
              </span>
            </span>
            <Switch
              checked={autoMuteEnabled}
              onCheckedChange={setAutoMuteEnabled}
              disabled={loading || saving || Boolean(loadError)}
              aria-label={ui("Silenciar automaticamente o som do dashboard")}
            />
          </label>

          {autoMuteEnabled && (
            <label className="block text-sm font-semibold">
              {ui("Tempo com som ativo")}
              <span className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={activeDurationMinutes}
                  onChange={(event) => setActiveDurationMinutes(Number(event.target.value))}
                  disabled={loading || saving}
                  className="h-10 w-24 rounded-md border border-border bg-background px-3"
                />
                <span className="text-muted-foreground">{ui("minutos")}</span>
              </span>
            </label>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-muted/10 p-3">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>
              <span className="block">{ui("Reativar automaticamente após um período")}</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {ui("Define por quanto tempo o Dashboard permanece silenciado.")}
              </span>
            </span>
            <Switch
              checked={timerEnabled}
              onCheckedChange={setTimerEnabled}
              disabled={loading || saving || Boolean(loadError)}
              aria-label={ui("Reativar automaticamente o som do dashboard")}
            />
          </label>

          {timerEnabled && (
            <label className="block text-sm font-semibold">
              {ui("Tempo de silenciamento")}
              <span className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(Number(event.target.value))}
                  disabled={loading || saving}
                  className="h-10 w-24 rounded-md border border-border bg-background px-3"
                />
                <span className="text-muted-foreground">{ui("minutos")}</span>
              </span>
            </label>
          )}
        </div>
      </div>

      {autoMuteEnabled && timerEnabled && (
        <div className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm text-foreground">
          {ui(
            "Enquanto houver chamado aberto com alarme no Dashboard, o ciclo alterna automaticamente: ",
          )}
          <strong>
            {activeDurationMinutes}
            {ui(" min com som")}
          </strong>{" "}
          →{" "}
          <strong>
            {durationMinutes}
            {ui(" min silenciado")}
          </strong>
          {ui(" → repetir.")}
        </div>
      )}

      <BigButton
        tone="primary"
        size="md"
        disabled={loading || saving || Boolean(loadError)}
        onClick={() => void handleSave()}
      >
        {saving ? ui("Salvando...") : ui("Salvar ciclo do alarme")}
      </BigButton>
    </section>
  );
}
