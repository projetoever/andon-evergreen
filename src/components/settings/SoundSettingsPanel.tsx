import { useAndon } from "@/context/AndonProvider";
import { BigButton } from "@/components/common/BigButton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { unlockAudio, testSound, isSoundAvailable } from "@/services/soundService";
import { Play, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

export function SoundSettingsPanel() {
  const {
    settings,
    updateSettings,
    soundConfigs,
    updateSoundConfigs,
    setAudioUnlocked,
    audioUnlocked,
  } = useAndon();

  function handleUnlock() {
    unlockAudio();
    setAudioUnlocked(true);
    toast.success("Sons ativados — painel pronto para uso");
  }

  function toggleSoundEnabled(key: string, enabled: boolean) {
    updateSoundConfigs(soundConfigs.map((s) => (s.key === key ? { ...s, enabled } : s)));
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 text-xl font-bold uppercase tracking-wider text-foreground">
        Sons
      </h3>
      <div className="mb-6 flex flex-col gap-4 rounded-xl bg-muted/30 p-4">
        <BigButton tone={audioUnlocked ? "neutral" : "primary"} size="lg" onClick={handleUnlock}>
          {audioUnlocked ? "Sons já ativados" : "INICIAR PAINEL / ATIVAR SONS"}
        </BigButton>
        <div className="flex items-center gap-3">
          <Switch
            checked={settings.soundsEnabled}
            onCheckedChange={(v) => updateSettings({ soundsEnabled: v })}
          />
          <span className="text-sm font-bold">
            {settings.soundsEnabled ? (
              <>
                <Volume2 className="inline h-4 w-4" /> Sons habilitados
              </>
            ) : (
              <>
                <VolumeX className="inline h-4 w-4" /> Sons desabilitados
              </>
            )}
          </span>
        </div>
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Volume: {Math.round(settings.soundVolume * 100)}%
          </label>
          <Slider
            value={[settings.soundVolume * 100]}
            onValueChange={(v) => updateSettings({ soundVolume: (v[0] ?? 80) / 100 })}
            max={100}
            step={5}
          />
        </div>
      </div>

      <div className="space-y-2">
        {soundConfigs.map((s) => {
          const available = isSoundAvailable(s.key);
          return (
            <div
              key={s.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
            >
              <div>
                <div className="text-base font-bold">{s.label}</div>
                <div className="text-xs text-muted-foreground">
                  {s.fileName}{" "}
                  {!available && <span className="text-danger">· arquivo não encontrado</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={s.enabled}
                  onCheckedChange={(v) => toggleSoundEnabled(s.key, v)}
                />
                <BigButton
                  tone="info"
                  size="md"
                  onClick={() => testSound(s.key)}
                  disabled={!available}
                >
                  <Play className="h-4 w-4" /> Testar
                </BigButton>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
