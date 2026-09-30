import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BigButton } from "@/components/common/BigButton";
import { Switch } from "@/components/ui/switch";
import {
  getSystemSettings,
  isValidDashboardSoundMuteDuration,
  updateSystemSettings,
} from "@/services/systemSettingsService";
import { DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES } from "@/utils/dashboardSoundMuteUtils";

export function DashboardSoundMuteSettings() {
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(
    DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getSystemSettings()
      .then((settings) => {
        if (cancelled) return;
        setTimerEnabled(settings.dashboardSoundMuteTimerEnabled);
        setDurationMinutes(settings.dashboardSoundMuteDurationMinutes);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o temporizador de silêncio.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!isValidDashboardSoundMuteDuration(durationMinutes)) {
      toast.error("Informe um tempo inteiro de pelo menos 1 minuto.");
      return;
    }

    setSaving(true);
    try {
      const settings = await updateSystemSettings({
        dashboardSoundMuteTimerEnabled: timerEnabled,
        dashboardSoundMuteDurationMinutes: durationMinutes,
      });
      setTimerEnabled(settings.dashboardSoundMuteTimerEnabled);
      setDurationMinutes(settings.dashboardSoundMuteDurationMinutes);
      toast.success("Temporizador de silêncio do dashboard salvo.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar o temporizador.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h4 className="text-sm font-bold uppercase tracking-wide text-foreground">
          Silenciamento do dashboard
        </h4>
        <p className="text-sm text-muted-foreground">
          Defina se o som deve ser reativado automaticamente após um período.
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm font-semibold">
        <span>Reativar automaticamente o som após um período</span>
        <Switch
          checked={timerEnabled}
          onCheckedChange={setTimerEnabled}
          disabled={loading || saving}
        />
      </label>

      {timerEnabled && (
        <label className="block max-w-xs text-sm font-semibold">
          Tempo de silenciamento
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
            <span className="text-muted-foreground">minutos</span>
          </span>
        </label>
      )}

      <BigButton
        tone="primary"
        size="md"
        disabled={loading || saving}
        onClick={() => void handleSave()}
      >
        {saving ? "Salvando..." : "Salvar temporizador"}
      </BigButton>
    </section>
  );
}
