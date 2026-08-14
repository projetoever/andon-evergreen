import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { BigButton } from "@/components/common/BigButton";
import { EmptyState } from "@/components/common/EmptyState";
import { EndTechnicianSessionModal } from "@/components/calls/EndTechnicianSessionModal";
import { FinishCallModal } from "@/components/calls/FinishCallModal";
import { QuickOpenCallModal } from "@/components/calls/QuickOpenCallModal";
import { TechnicianIdentificationModal } from "@/components/calls/TechnicianIdentificationModal";
import { MachineActionPanel } from "@/components/machines/MachineActionPanel";
import { MachineActiveCallSelector } from "@/components/machines/MachineActiveCallSelector";
import { MachineCurrentCallPanel } from "@/components/machines/MachineCurrentCallPanel";
import { MachineCurrentStatusPanel } from "@/components/machines/MachineCurrentStatusPanel";
import { MachineDetailHeader } from "@/components/machines/MachineDetailHeader";
import { ProductionSchedulePanel } from "@/components/machines/ProductionSchedulePanel";
import { AdminLoginModal } from "@/components/settings/AdminLoginModal";
import { useAndon } from "@/context/AndonProvider";
import { useAndonOpenCallSound } from "@/hooks/useAndonOpenCallSound";
import { useTicker } from "@/hooks/useTicker";
import {
  getMachineScreenLock,
  lockMachineScreen,
  unlockMachineScreen,
} from "@/services/machineScreenLockService";
import {
  isMachineSoundEnabled,
  setMachineSoundEnabled,
} from "@/services/machineSoundPreferenceService";
import { getCategoryConfigs } from "@/services/categoryConfigService";
import { playAndonSound, stopAndonSound } from "@/services/soundService";
import type { CallSubtype } from "@/types/andon";
import type { AndonCategoryConfig } from "@/types/settings";
import { requiresMaintenanceTechnician } from "@/utils/callTypeUtils";
import { diffMinutes, formatDurationMinutes } from "@/utils/durationUtils";
import { formatShiftName } from "@/utils/technicianDisplayUtils";

const ACTIVE_STATUSES = new Set(["open", "in_progress", "post_maintenance"]);

export function MachineDetailPage({ machineId }: { machineId: string }) {
  const {
    machines,
    calls,
    openCalls,
    attendCall,
    cancelCall,
    completeMaintenance,
    returnToMaintenance,
    updateMachineProductionMode,
    soundConfigs,
    settings,
    audioUnlocked,
  } = useAndon();

  const navigate = useNavigate();
  const machine = machines.find((item) => item.id === machineId);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<CallSubtype | null>(null);
  const [categories, setCategories] = useState<AndonCategoryConfig[]>([]);
  const [conditionDialogOpen, setConditionDialogOpen] = useState(false);
  const [finishCallId, setFinishCallId] = useState<string | null>(null);
  const [machineSoundEnabled, setMachineSoundEnabledState] = useState(true);
  const [screenLock, setScreenLock] = useState(() => getMachineScreenLock());
  const [unlockLoginOpen, setUnlockLoginOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const tick = useTicker(1000);

  const activeCalls = useMemo(
    () =>
      calls
        .filter(
          (call) =>
            call.machineId === machineId && !call.isSystemTest && ACTIVE_STATUSES.has(call.status),
        )
        .sort((current, next) => next.openedAt.localeCompare(current.openedAt)),
    [calls, machineId],
  );

  useEffect(() => {
    if (!activeCalls.length) {
      setSelectedCallId(null);
      return;
    }
    if (selectedCallId && activeCalls.some((call) => call.id === selectedCallId)) return;
    const preferred =
      activeCalls.find((call) => call.id === machine?.currentCallId) ?? activeCalls[0];
    setSelectedCallId(preferred.id);
  }, [activeCalls, machine?.currentCallId, selectedCallId]);

  const currentCall = selectedCallId
    ? (activeCalls.find((call) => call.id === selectedCallId) ?? null)
    : null;
  const activeSubtypes = useMemo(
    () => new Set(activeCalls.map((call) => call.subtype)),
    [activeCalls],
  );
  const latestOpenCall = activeCalls.find((call) => call.status === "open") ?? null;

  useEffect(() => {
    let cancelled = false;
    getCategoryConfigs({ activeOnly: true })
      .then((items) => {
        if (!cancelled) setCategories(items);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Não foi possível carregar os setores",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const lockedScreen = getMachineScreenLock();
    setScreenLock(lockedScreen);
    if (lockedScreen?.locked && lockedScreen.machineId !== machineId) {
      void navigate({
        to: "/machines/$machineId",
        params: { machineId: lockedScreen.machineId },
        replace: true,
      });
    }
  }, [machineId, navigate]);

  useEffect(() => {
    if (machine) setMachineSoundEnabledState(isMachineSoundEnabled(machine.id));
  }, [machine]);

  const nowIso = useMemo(() => {
    void tick;
    return new Date().toISOString();
  }, [tick]);
  const sessions = useMemo(
    () =>
      (currentCall?.technicianSessions ?? [])
        .slice()
        .sort(
          (current, next) =>
            new Date(current.startedAt).getTime() - new Date(next.startedAt).getTime(),
        ),
    [currentCall?.technicianSessions],
  );
  const activeSessions = sessions.filter((session) => !session.endedAt);
  const firstSessionStartedAt = sessions[0]?.startedAt ?? null;
  const hasLegacyUnassignedPeriod = Boolean(
    currentCall?.currentAttendanceStartedAt &&
    (!firstSessionStartedAt ||
      new Date(firstSessionStartedAt).getTime() -
        new Date(currentCall.currentAttendanceStartedAt).getTime() >
        1000),
  );
  const requiresTechnician = currentCall ? requiresMaintenanceTechnician(currentCall) : false;
  const timeWithoutTechnicianMinutes =
    currentCall?.status === "in_progress" && activeSessions.length === 0
      ? diffMinutes(currentCall.currentAttendanceStartedAt ?? currentCall.attendedAt, nowIso)
      : 0;
  const screenLocked = Boolean(
    machine && screenLock?.locked === true && screenLock.machineId === machine.id,
  );

  useAndonOpenCallSound({
    calls,
    machines,
    settings,
    soundConfigs,
    audioUnlocked,
    machineId,
    respectMachinePreference: true,
  });

  function handleToggleScreenLock() {
    if (!machine) return;
    if (screenLocked) {
      setUnlockLoginOpen(true);
      return;
    }
    lockMachineScreen(machine.id);
    setScreenLock({ locked: true, machineId: machine.id });
    toast.success(`Tela da máquina ${machine.id} fixada`);
  }

  function handleUnlockSuccess() {
    unlockMachineScreen();
    setScreenLock(null);
    toast.success("Tela desbloqueada. Navegação liberada.");
  }

  async function handleCancelCall() {
    if (!currentCall || !machine) return;
    try {
      await cancelCall({
        callId: currentCall.id,
        reason: "Aberto por engano",
        cancelledBy: "operador",
      });
      toast.success("Chamado cancelado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não é possível cancelar chamado já atendido.",
      );
    }
  }

  async function handleAttend() {
    if (!currentCall) return;
    if (requiresMaintenanceTechnician(currentCall)) {
      setStartOpen(true);
      return;
    }

    try {
      await attendCall({ callId: currentCall.id, technicians: [] });
      toast.success("Chamado em atendimento");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atender chamado");
    }
  }

  async function handleCompleteMaintenance() {
    if (!currentCall) return;
    try {
      await completeMaintenance(currentCall.id);
      toast.success("Manutenção concluída. Chamado em acompanhamento.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao concluir manutenção");
    }
  }

  async function handleReturnToMaintenance() {
    if (!currentCall) return;
    try {
      await returnToMaintenance(currentCall.id);
      toast.success("Chamado voltou à manutenção.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao retornar à manutenção");
    }
  }

  async function handleOpenSubtype(subtype: CallSubtype) {
    if (!machine) return;

    setSelectedSubtype(subtype);

    if (machine.machineStatus !== "stopped") {
      setConditionDialogOpen(true);
      return;
    }

    const category = categories.find((item) => item.id === subtype);
    if (!category) {
      toast.error("Setor não encontrado ou inativo");
      return;
    }

    try {
      await openCalls([
        {
          machineId: machine.id,
          category: category.categoryGroup,
          subtype,
          criticality: "medium",
          machineCondition: "stopped",
        },
      ]);
      toast.success(`Chamado de ${category.displayName} aberto com a máquina parada.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o chamado");
    }
  }

  if (!machine) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-10 w-10" />}
        title="Máquina não encontrada"
        description={`A máquina "${machineId}" não existe.`}
      />
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col gap-1.5 overflow-x-hidden overflow-y-auto p-2 xl:overflow-y-hidden">
      <MachineDetailHeader
        machine={machine}
        machineSoundEnabled={machineSoundEnabled}
        screenLocked={screenLocked}
        onToggleScreenLock={handleToggleScreenLock}
        onToggleMachineSound={() => {
          const next = !machineSoundEnabled;
          setMachineSoundEnabled(machine.id, next);
          setMachineSoundEnabledState(next);
          if (!next) {
            stopAndonSound(machine.id);
            toast.success("Som do ANDON silenciado para esta máquina");
            return;
          }

          if (latestOpenCall && settings.soundsEnabled && audioUnlocked) {
            const config = soundConfigs.find((item) => item.key === latestOpenCall.subtype);
            const repeatInterval = config?.repeatUntilAttended ? config.repeatIntervalSeconds : 0;
            void playAndonSound(machine.id, latestOpenCall.subtype, repeatInterval);
          }
          toast.success("Som do ANDON ativado para esta máquina");
        }}
      />

      <ProductionSchedulePanel
        machine={machine}
        onChange={(productionMode) => updateMachineProductionMode(machine.id, productionMode)}
      />

      <MachineActiveCallSelector
        calls={activeCalls}
        selectedCallId={currentCall?.id ?? null}
        onSelect={setSelectedCallId}
      />

      <div className="grid min-h-[200px] flex-1 grid-cols-1 items-stretch gap-1.5 overflow-hidden xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <MachineCurrentStatusPanel
          machine={machine}
          compactNormal={!currentCall && machine.machineStatus === "running"}
        />
        <MachineCurrentCallPanel
          call={currentCall}
          compactEmpty={!currentCall && machine.machineStatus === "running"}
          currentMachineStatus={machine.machineStatus}
        />
      </div>

      {currentCall?.status === "in_progress" && requiresTechnician && (
        <section className="rounded-xl border border-border bg-card p-2.5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground md:text-base">
              Atendimento por mantenedor
            </h3>
            <div className="grid min-w-[310px] flex-1 grid-cols-2 gap-1.5 md:max-w-2xl">
              <BigButton
                tone="info"
                size="md"
                className="min-h-9 whitespace-nowrap px-2 text-[11px] shadow md:text-xs"
                onClick={() => setAddOpen(true)}
              >
                Adicionar mantenedor
              </BigButton>
              <BigButton
                tone="warning"
                size="md"
                className="min-h-9 whitespace-nowrap px-2 text-[11px] shadow md:text-xs"
                disabled={activeSessions.length === 0}
                onClick={() => setEndOpen(true)}
              >
                Encerrar atendimento individual
              </BigButton>
            </div>
          </div>

          {activeSessions.length === 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
              <span>
                Nenhum mantenedor ativo. Adicione um responsável para registrar o tempo individual.
              </span>
              <strong className="whitespace-nowrap text-foreground">
                Sem mantenedor: {formatDurationMinutes(timeWithoutTechnicianMinutes)}
              </strong>
            </div>
          ) : (
            <div
              className="mt-1.5 grid gap-1.5"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
            >
              {hasLegacyUnassignedPeriod && currentCall.currentAttendanceStartedAt && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/10 px-2.5 py-1.5 text-xs">
                  <span className="truncate text-sm font-bold text-foreground">
                    Sem mantenedor apontado
                  </span>
                  <strong className="whitespace-nowrap text-info">
                    {formatDurationMinutes(
                      diffMinutes(
                        currentCall.currentAttendanceStartedAt,
                        sessions[0]?.startedAt ?? nowIso,
                      ),
                    )}
                  </strong>
                </div>
              )}
              {activeSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
                >
                  <span className="min-w-0 truncate text-sm font-bold text-foreground">
                    {session.technicianName}
                    {session.shiftName && (
                      <small className="ml-1 font-normal text-muted-foreground">
                        · {formatShiftName(session.shiftName)}
                      </small>
                    )}
                  </span>
                  <strong className="whitespace-nowrap text-info">
                    {formatDurationMinutes(diffMinutes(session.startedAt, nowIso))}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <MachineActionPanel
        machine={machine}
        currentCall={currentCall}
        categories={categories}
        activeSubtypes={activeSubtypes}
        onOpenSubtype={(subtype) => void handleOpenSubtype(subtype)}
        onAttend={() => void handleAttend()}
        onCancelCall={() => void handleCancelCall()}
        onFinish={() => currentCall && setFinishCallId(currentCall.id)}
        onCompleteMaintenance={() => void handleCompleteMaintenance()}
        onReturnToMaintenance={() => void handleReturnToMaintenance()}
        screenLocked={screenLocked}
      />

      <QuickOpenCallModal
        open={conditionDialogOpen}
        onOpenChange={setConditionDialogOpen}
        machineId={machine.id}
        subtype={selectedSubtype}
      />
      <TechnicianIdentificationModal
        open={startOpen}
        onOpenChange={setStartOpen}
        callId={currentCall?.id ?? null}
        purpose="start"
      />
      <TechnicianIdentificationModal
        open={addOpen}
        onOpenChange={setAddOpen}
        callId={currentCall?.id ?? null}
        purpose="add"
        excludeNames={activeSessions.map((session) => session.technicianName)}
      />
      <AdminLoginModal
        open={unlockLoginOpen}
        onOpenChange={setUnlockLoginOpen}
        onSuccess={handleUnlockSuccess}
        title="Desbloquear tela fixada"
        description="Informe o mesmo usuário e senha administrativos para liberar a navegação ao painel."
        successLabel="Desbloquear"
      />
      <FinishCallModal
        open={finishCallId !== null}
        onOpenChange={(isOpen) => !isOpen && setFinishCallId(null)}
        callId={finishCallId}
      />
      <EndTechnicianSessionModal
        open={endOpen}
        onOpenChange={setEndOpen}
        callId={currentCall?.id ?? null}
        sessions={activeSessions}
      />
    </div>
  );
}
