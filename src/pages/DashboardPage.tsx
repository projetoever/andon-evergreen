import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAndon } from "@/context/AndonProvider";
import { StatusSummaryBar } from "@/components/layout/StatusSummaryBar";
import { MachineGrid } from "@/components/machines/MachineGrid";
import { BigButton } from "@/components/common/BigButton";
import { stopAndonSound, unlockAudio } from "@/services/soundService";
import { Volume2, VolumeX, Settings } from "lucide-react";
import { AdminSettingsModal } from "@/components/settings/AdminSettingsModal";
import { AdminLoginModal } from "@/components/settings/AdminLoginModal";
import { isAdminAuthenticated } from "@/services/adminAuthService";
import { getMachineScreenLock } from "@/services/machineScreenLockService";
import { toast } from "sonner";
import { useAndonOpenCallSound } from "@/hooks/useAndonOpenCallSound";

export function DashboardPage() {
  const {
    machines,
    calls,
    settings,
    soundConfigs,
    audioUnlocked,
    setAudioUnlocked,
  } = useAndon();

  const navigate = useNavigate();
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);
  const [dashboardSoundMuted, setDashboardSoundMuted] = useState(false);

  useAndonOpenCallSound({
    calls,
    machines,
    settings,
    soundConfigs,
    audioUnlocked: audioUnlocked && !dashboardSoundMuted,
  });

  const [lockedMachineId, setLockedMachineId] = useState<string | null>(() => getMachineScreenLock()?.machineId ?? null);

  useEffect(() => {
    const lockedScreen = getMachineScreenLock();
    if (!lockedScreen?.locked) {
      setLockedMachineId(null);
      return;
    }

    setLockedMachineId(lockedScreen.machineId);
    void navigate({
      to: "/machines/$machineId",
      params: { machineId: lockedScreen.machineId },
      replace: true,
    });
  }, [navigate]);

  function handleUnlock() {
    unlockAudio();
    setAudioUnlocked(true);
    setDashboardSoundMuted(false);
    toast.success("Painel ativo — sons habilitados");
  }

  function handleToggleDashboardSound() {
    const nextMuted = !dashboardSoundMuted;
    setDashboardSoundMuted(nextMuted);

    if (nextMuted) {
      stopAndonSound();
      toast.success("Som do dashboard silenciado");
      return;
    }

    toast.success("Som do dashboard reativado");
  }

  if (lockedMachineId) {
    return (
      <div className="flex h-dvh min-h-0 items-center justify-center bg-background p-4 text-center text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Tela fixada na máquina {lockedMachineId}. Redirecionando...
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col gap-1.5 overflow-hidden p-2 md:p-3">
      {!audioUnlocked && (
        <div className="flex shrink-0 flex-col items-center justify-between gap-2 rounded-xl border-2 border-warning bg-warning/10 px-3 py-1.5 text-warning sm:flex-row">
          <div className="flex items-center gap-3">
            <Volume2 className="h-6 w-6" />
            <span className="text-base font-bold">
              Toque em "Iniciar Painel" para liberar os sons dos chamados.
            </span>
          </div>
          <BigButton tone="primary" size="md" onClick={handleUnlock}>
            INICIAR PAINEL / ATIVAR SONS
          </BigButton>
        </div>
      )}

      <div className="shrink-0">
        <StatusSummaryBar />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1">
        <h2 className="text-lg font-bold uppercase tracking-wide text-foreground md:text-xl">Máquinas</h2>
        <div className="flex items-center gap-2">
          {audioUnlocked && (
            <button
              type="button"
              title={dashboardSoundMuted ? "Reativar som do dashboard" : "Silenciar som do dashboard"}
              aria-label={dashboardSoundMuted ? "Reativar som do dashboard" : "Silenciar som do dashboard"}
              onClick={handleToggleDashboardSound}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
            >
              {dashboardSoundMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              {dashboardSoundMuted ? "Som silenciado" : "Silenciar som"}
            </button>
          )}

          <button
            type="button"
            title="Configurar sons do ANDON"
            aria-label="Configurar sons do ANDON"
            onClick={() => (isAdminAuthenticated() ? setAdminSettingsOpen(true) : setAdminLoginOpen(true))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AdminLoginModal open={adminLoginOpen} onOpenChange={setAdminLoginOpen} onSuccess={() => setAdminSettingsOpen(true)} />
      <AdminSettingsModal open={adminSettingsOpen} onOpenChange={setAdminSettingsOpen} />

      <MachineGrid
        className="min-h-0 flex-1"
        machines={[...machines].filter((machine) => machine.isActive).sort((a, b) => (a.displayOrder ?? Number(a.id)) - (b.displayOrder ?? Number(b.id)))}
      />
    </div>
  );
}
