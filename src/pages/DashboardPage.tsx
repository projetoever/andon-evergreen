import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAndon } from "@/context/AndonProvider";
import { StatusSummaryBar } from "@/components/layout/StatusSummaryBar";
import { MachineGrid } from "@/components/machines/MachineGrid";
import { BigButton } from "@/components/common/BigButton";
import { ClockDisplay } from "@/components/common/ClockDisplay";
import { stopAndonSound, unlockAudio } from "@/services/soundService";
import { ListOrdered, Volume2, VolumeX, Settings } from "lucide-react";
import { AdminSettingsModal } from "@/components/settings/AdminSettingsModal";
import { AdminLoginModal } from "@/components/settings/AdminLoginModal";
import { DashboardPriorityLoginModal } from "@/components/priority/DashboardPriorityLoginModal";
import { isAdminAuthenticated } from "@/services/adminAuthService";
import { isDashboardPriorityAuthenticated } from "@/services/dashboardPriorityService";
import { getMachineScreenLock } from "@/services/machineScreenLockService";
import { toast } from "sonner";
import { useAndonOpenCallSound } from "@/hooks/useAndonOpenCallSound";
import {
  getDashboardSoundState,
  getSystemSettings,
  SYSTEM_SETTINGS_CHANGED_EVENT,
  updateDashboardSoundState,
} from "@/services/systemSettingsService";
import type { DashboardMachineOrderMode, SystemSettings } from "@/types/systemSettings";
import {
  DEFAULT_DASHBOARD_SOUND_ACTIVE_DURATION_MINUTES,
  DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES,
  hasDashboardAlertingCall,
  hasRealCallOpenedAfter,
  startDashboardSoundActiveTimer,
  startDashboardSoundMuteDeadlineTimer,
} from "@/utils/dashboardSoundMuteUtils";

export function DashboardPage() {
  const { machines, calls, settings, soundConfigs, audioUnlocked, setAudioUnlocked } = useAndon();

  const navigate = useNavigate();
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);
  const [priorityLoginOpen, setPriorityLoginOpen] = useState(false);
  const [dashboardSoundMuted, setDashboardSoundMuted] = useState(false);
  const [dashboardSoundSyncing, setDashboardSoundSyncing] = useState(false);
  const [dashboardMachineOrderMode, setDashboardMachineOrderMode] =
    useState<DashboardMachineOrderMode>("default");
  const [dashboardMuteTimerEnabled, setDashboardMuteTimerEnabled] = useState(false);
  const [dashboardMuteDurationMinutes, setDashboardMuteDurationMinutes] = useState(
    DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES,
  );
  const [dashboardAutoMuteTimerEnabled, setDashboardAutoMuteTimerEnabled] = useState(false);
  const [dashboardActiveDurationMinutes, setDashboardActiveDurationMinutes] = useState(
    DEFAULT_DASHBOARD_SOUND_ACTIVE_DURATION_MINUTES,
  );
  const muteTimerCancelRef = useRef<(() => void) | null>(null);
  const activeTimerCancelRef = useRef<(() => void) | null>(null);
  const dashboardMutedAtRef = useRef<string | null>(null);
  const dashboardMuteReasonRef = useRef<"manual" | "auto" | null>(null);
  const callsRef = useRef(calls);

  useEffect(() => {
    callsRef.current = calls;
  }, [calls]);

  const hasDashboardAlertCall = useMemo(
    () =>
      settings.soundsEnabled &&
      hasDashboardAlertingCall(calls, machines, soundConfigs),
    [calls, machines, settings.soundsEnabled, soundConfigs],
  );

  useAndonOpenCallSound({
    calls,
    machines,
    settings,
    soundConfigs,
    audioUnlocked: audioUnlocked && !dashboardSoundMuted,
    soundScope: "dashboard",
  });

  const cancelDashboardMuteTimer = useCallback(() => {
    muteTimerCancelRef.current?.();
    muteTimerCancelRef.current = null;
  }, []);

  const cancelDashboardActiveTimer = useCallback(() => {
    activeTimerCancelRef.current?.();
    activeTimerCancelRef.current = null;
  }, []);

  const persistDashboardSoundMuted = useCallback(
    async (muted: boolean, reason: "manual" | "auto" = "manual") => {
      setDashboardSoundSyncing(true);
      try {
        return await updateDashboardSoundState(muted, reason);
      } catch {
        toast.error(
          muted
            ? "Não foi possível silenciar a sirene externa"
            : "Não foi possível reativar a sirene externa",
        );
        return null;
      } finally {
        setDashboardSoundSyncing(false);
      }
    },
    [],
  );

  const reactivateDashboardSound = useCallback(
    async (message?: string) => {
      const synced = await persistDashboardSoundMuted(false);
      if (!synced) return false;

      cancelDashboardMuteTimer();
      cancelDashboardActiveTimer();
      dashboardMutedAtRef.current = null;
      dashboardMuteReasonRef.current = null;
      setDashboardSoundMuted(false);
      if (message) toast.success(message);
      return true;
    },
    [cancelDashboardActiveTimer, cancelDashboardMuteTimer, persistDashboardSoundMuted],
  );

  const muteDashboardSound = useCallback(
    async (reason: "manual" | "auto", message?: string) => {
      cancelDashboardActiveTimer();
      cancelDashboardMuteTimer();
      dashboardMuteReasonRef.current = reason;
      setDashboardSoundMuted(true);
      stopAndonSound(undefined, "dashboard");

      const synced = await persistDashboardSoundMuted(true, reason);
      if (!synced) {
        dashboardMutedAtRef.current = null;
        dashboardMuteReasonRef.current = null;
        setDashboardSoundMuted(false);
        return false;
      }

      dashboardMutedAtRef.current = synced.mutedAt;
      dashboardMuteReasonRef.current = synced.reason ?? reason;
      muteTimerCancelRef.current = startDashboardSoundMuteDeadlineTimer(
        synced.mutedUntil,
        () => {
          muteTimerCancelRef.current = null;
          void reactivateDashboardSound(
            reason === "auto"
              ? "Tempo de silêncio encerrado — ciclo do alarme reativado"
              : "Tempo de silêncio encerrado — som do dashboard reativado",
          );
        },
      );

      if (message) toast.success(message);
      return true;
    },
    [
      cancelDashboardActiveTimer,
      cancelDashboardMuteTimer,
      persistDashboardSoundMuted,
      reactivateDashboardSound,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    const applySettings = (systemSettings: SystemSettings) => {
      setDashboardMuteTimerEnabled(systemSettings.dashboardSoundMuteTimerEnabled);
      setDashboardMuteDurationMinutes(systemSettings.dashboardSoundMuteDurationMinutes);
      setDashboardAutoMuteTimerEnabled(systemSettings.dashboardSoundAutoMuteTimerEnabled);
      setDashboardActiveDurationMinutes(systemSettings.dashboardSoundActiveDurationMinutes);
      setDashboardMachineOrderMode(
        systemSettings.dashboardMachineOrderMode === "priority" ? "priority" : "default",
      );
    };
    const handleSettingsChanged = (event: Event) => {
      applySettings((event as CustomEvent<SystemSettings>).detail);
    };

    void getSystemSettings()
      .then((systemSettings) => {
        if (!cancelled) applySettings(systemSettings);
      })
      .catch(() => {
        // Defaults preservam as configuracoes locais se a leitura falhar.
      });

    void getDashboardSoundState()
      .then((soundState) => {
        if (cancelled) return;

        cancelDashboardMuteTimer();
        dashboardMutedAtRef.current = soundState.mutedAt;
        dashboardMuteReasonRef.current = soundState.reason;
        setDashboardSoundMuted(soundState.muted);

        if (soundState.muted) {
          stopAndonSound(undefined, "dashboard");
          muteTimerCancelRef.current = startDashboardSoundMuteDeadlineTimer(
            soundState.mutedUntil,
            () => {
              muteTimerCancelRef.current = null;
              void reactivateDashboardSound(
                soundState.reason === "auto"
                  ? "Tempo de silêncio encerrado — ciclo do alarme reativado"
                  : "Tempo de silêncio encerrado — som do dashboard reativado",
              );
            },
          );
        }
      })
      .catch(() => {
        // O botao continua operacional e exibira erro se a escrita do estado falhar.
      });

    window.addEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, handleSettingsChanged);

    return () => {
      cancelled = true;
      window.removeEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    };
  }, []);

  useEffect(
    () => () => {
      cancelDashboardMuteTimer();
      cancelDashboardActiveTimer();
    },
    [cancelDashboardActiveTimer, cancelDashboardMuteTimer],
  );

  useEffect(() => {
    if (!dashboardSoundMuted) return;
    if (!hasRealCallOpenedAfter(calls, dashboardMutedAtRef.current)) return;

    void reactivateDashboardSound("Novo chamado recebido — som do dashboard reativado");
  }, [calls, dashboardSoundMuted, reactivateDashboardSound]);


  useEffect(() => {
    cancelDashboardActiveTimer();

    if (
      !audioUnlocked ||
      dashboardSoundMuted ||
      !dashboardAutoMuteTimerEnabled ||
      !hasDashboardAlertCall
    ) {
      return;
    }

    activeTimerCancelRef.current = startDashboardSoundActiveTimer(
      true,
      dashboardActiveDurationMinutes,
      () => {
        activeTimerCancelRef.current = null;
        void muteDashboardSound(
          "auto",
          dashboardMuteTimerEnabled
            ? `Tempo com som encerrado — dashboard silenciado por ${dashboardMuteDurationMinutes} minuto(s)`
            : "Tempo com som encerrado — dashboard silenciado",
        );
      },
    );

    return cancelDashboardActiveTimer;
  }, [
    audioUnlocked,
    cancelDashboardActiveTimer,
    dashboardActiveDurationMinutes,
    dashboardAutoMuteTimerEnabled,
    dashboardMuteDurationMinutes,
    dashboardMuteTimerEnabled,
    dashboardSoundMuted,
    hasDashboardAlertCall,
    muteDashboardSound,
  ]);

  useEffect(() => {
    if (
      dashboardSoundMuted &&
      dashboardMuteReasonRef.current === "auto" &&
      !hasDashboardAlertCall
    ) {
      void reactivateDashboardSound();
    }
  }, [dashboardSoundMuted, hasDashboardAlertCall, reactivateDashboardSound]);

  const [lockedMachineId, setLockedMachineId] = useState<string | null>(
    () => getMachineScreenLock()?.machineId ?? null,
  );

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
    toast.success(
      dashboardSoundMuted
        ? "Painel ativo — som do dashboard permanece silenciado"
        : "Painel ativo — sons habilitados",
    );
  }

  function handleToggleDashboardSound() {
    if (dashboardSoundSyncing) return;

    if (dashboardSoundMuted) {
      void reactivateDashboardSound("Som do dashboard reativado");
      return;
    }

    void muteDashboardSound(
      "manual",
      dashboardMuteTimerEnabled
        ? `Som do dashboard silenciado por ${dashboardMuteDurationMinutes} minuto(s)`
        : "Som do dashboard silenciado",
    );
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

      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="min-w-0 justify-self-start">
          <h2 className="text-lg font-bold uppercase tracking-wide text-foreground md:text-xl">
            Máquinas
          </h2>
        </div>
        <div className="col-span-2 row-start-2 justify-self-center md:col-span-1 md:col-start-2 md:row-start-1">
          <ClockDisplay />
        </div>
        <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 justify-self-end md:col-start-3">
          {audioUnlocked && (
            <button
              type="button"
              title={
                dashboardSoundMuted ? "Reativar som do dashboard" : "Silenciar som do dashboard"
              }
              aria-label={
                dashboardSoundMuted ? "Reativar som do dashboard" : "Silenciar som do dashboard"
              }
              onClick={handleToggleDashboardSound}
              disabled={dashboardSoundSyncing}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {dashboardSoundMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
              {dashboardSoundMuted ? "Som silenciado" : "Silenciar som"}
            </button>
          )}

          <button
            type="button"
            title="Organizar prioridade de produção"
            aria-label="Organizar prioridade de produção"
            onClick={() => {
              if (isDashboardPriorityAuthenticated()) {
                void navigate({ to: "/machine-priorities" });
              } else {
                setPriorityLoginOpen(true);
              }
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:text-foreground"
          >
            <ListOrdered className="h-4 w-4" />
          </button>

          <button
            type="button"
            title="Configurar sons do ANDON"
            aria-label="Configurar sons do ANDON"
            onClick={() =>
              isAdminAuthenticated() ? setAdminSettingsOpen(true) : setAdminLoginOpen(true)
            }
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AdminLoginModal
        open={adminLoginOpen}
        onOpenChange={setAdminLoginOpen}
        onSuccess={() => setAdminSettingsOpen(true)}
      />
      <AdminSettingsModal open={adminSettingsOpen} onOpenChange={setAdminSettingsOpen} />
      <DashboardPriorityLoginModal
        open={priorityLoginOpen}
        onOpenChange={setPriorityLoginOpen}
        onSuccess={() => void navigate({ to: "/machine-priorities" })}
      />

      <MachineGrid
        className="min-h-0 flex-1"
        orderMode={dashboardMachineOrderMode}
        machines={[...machines]
          .filter((machine) => machine.isActive)
          .sort((a, b) => (a.displayOrder ?? Number(a.id)) - (b.displayOrder ?? Number(b.id)))}
      />
    </div>
  );
}
