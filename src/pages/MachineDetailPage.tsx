import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { BigButton } from "@/components/common/BigButton";
import { EmptyState } from "@/components/common/EmptyState";
import { CancelCallModal } from "@/components/calls/CancelCallModal";
import { EndTechnicianSessionModal } from "@/components/calls/EndTechnicianSessionModal";
import { FinishCallModal } from "@/components/calls/FinishCallModal";
import { QuickOpenCallModal } from "@/components/calls/QuickOpenCallModal";
import { TechnicianIdentificationModal } from "@/components/calls/TechnicianIdentificationModal";
import { MachineActionPanel } from "@/components/machines/MachineActionPanel";
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
import { cn } from "@/lib/utils";
import { getCategoryConfigs } from "@/services/categoryConfigService";
import { getSystemSettings } from "@/services/systemSettingsService";
import { playAndonSound, stopAndonSound, unlockAudio } from "@/services/soundService";
import { getCurrentWorkstationId } from "@/services/workstationIdentityService";
import { registerCurrentWorkstation } from "@/services/workstationService";
import type { CallSubtype } from "@/types/andon";
import type { AndonCategoryConfig } from "@/types/settings";
import { requiresMaintenanceTechnician } from "@/utils/callTypeUtils";
import { diffMinutes, formatDurationMinutes } from "@/utils/durationUtils";
import { getServerNowIso } from "@/utils/serverClock";
import {
  buildTechnicianParticipationSummaries,
  getTechnicianPhaseAccumulatedMinutes,
  resolveSessionPhase,
} from "@/utils/technicianSessionUtils";
import {
  evaluateMaintenanceCompletionAuthorization,
  type WorkstationRestrictionContext,
} from "@/utils/workstationAttendanceUtils";
import { resolveWorkOrderRequirement } from "@/utils/workOrderUtils";

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
    setAudioUnlocked,
  } = useAndon();

  const navigate = useNavigate();
  const machine = machines.find((item) => item.id === machineId);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const knownActiveCallIdsRef = useRef<Set<string>>(new Set());
  const selectionMachineIdRef = useRef(machineId);
  const [selectedSubtype, setSelectedSubtype] = useState<CallSubtype | null>(null);
  const [forcedMachineCondition, setForcedMachineCondition] = useState<"stopped" | undefined>();
  const [categories, setCategories] = useState<AndonCategoryConfig[]>([]);
  const [conditionDialogOpen, setConditionDialogOpen] = useState(false);
  const [finishCallId, setFinishCallId] = useState<string | null>(null);
  const [cancelCallId, setCancelCallId] = useState<string | null>(null);
  const [machineSoundEnabled, setMachineSoundEnabledState] = useState(true);
  const [screenLock, setScreenLock] = useState(() => getMachineScreenLock());
  const [unlockLoginOpen, setUnlockLoginOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [isCompletingMaintenance, setIsCompletingMaintenance] = useState(false);
  const [workstationRestrictionContext, setWorkstationRestrictionContext] =
    useState<WorkstationRestrictionContext | null>(null);
  const [workstationAuthorizationLoadFailed, setWorkstationAuthorizationLoadFailed] =
    useState(false);
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
    if (selectionMachineIdRef.current !== machineId) {
      selectionMachineIdRef.current = machineId;
      knownActiveCallIdsRef.current = new Set();
    }

    const previousIds = knownActiveCallIdsRef.current;
    const currentIds = new Set(activeCalls.map((call) => call.id));
    knownActiveCallIdsRef.current = currentIds;

    if (!activeCalls.length) {
      setSelectedCallId(null);
      return;
    }

    const newlyOpenedCall = activeCalls.find((call) => !previousIds.has(call.id));
    if (previousIds.size > 0 && newlyOpenedCall) {
      setSelectedCallId(newlyOpenedCall.id);
      return;
    }

    const preferred =
      activeCalls.find((call) => call.id === machine?.currentCallId) ?? activeCalls[0];
    setSelectedCallId((current) => (current && currentIds.has(current) ? current : preferred.id));
  }, [activeCalls, machine?.currentCallId, machineId]);

  const currentCall = selectedCallId
    ? (activeCalls.find((call) => call.id === selectedCallId) ?? null)
    : null;
  const openStopOwnerCallId = machine?.stopHistory.find((event) => !event.resumedAt)?.callId;
  const hasActiveStopOwner = Boolean(
    openStopOwnerCallId && activeCalls.some((call) => call.id === openStopOwnerCallId),
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
    let cancelled = false;

    Promise.allSettled([getSystemSettings(), registerCurrentWorkstation()]).then(
      ([settingsResult, workstationResult]) => {
        if (cancelled) return;
        if (settingsResult.status === "rejected") {
          setWorkstationRestrictionContext(null);
          setWorkstationAuthorizationLoadFailed(true);
          return;
        }

        const restricted =
          settingsResult.value.restrictMaintenanceCompletionToAttendanceWorkstation;
        if (!restricted) {
          setWorkstationRestrictionContext({
            restricted: false,
            currentWorkstationId: null,
            currentWorkstationActive: null,
          });
          setWorkstationAuthorizationLoadFailed(false);
          return;
        }

        if (workstationResult.status === "fulfilled") {
          setWorkstationRestrictionContext({
            restricted: true,
            currentWorkstationId: workstationResult.value.id,
            currentWorkstationActive: workstationResult.value.active,
          });
          setWorkstationAuthorizationLoadFailed(false);
          return;
        }

        if (!getCurrentWorkstationId()) {
          setWorkstationRestrictionContext({
            restricted: true,
            currentWorkstationId: null,
            currentWorkstationActive: null,
          });
          setWorkstationAuthorizationLoadFailed(false);
          return;
        }

        setWorkstationRestrictionContext(null);
        setWorkstationAuthorizationLoadFailed(true);
      },
    );

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
    return getServerNowIso();
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
  const activeSessions = sessions.filter(
    (session) =>
      !session.endedAt &&
      (!currentCall ||
        resolveSessionPhase(session, currentCall.status) ===
          (currentCall.status === "post_maintenance" ? "follow_up" : "maintenance")),
  );
  const participationSummaries = useMemo(
    () =>
      buildTechnicianParticipationSummaries(sessions, nowIso, currentCall?.status).sort((a, b) =>
        a.technicianName.localeCompare(b.technicianName, "pt-BR"),
      ),
    [currentCall?.status, nowIso, sessions],
  );
  const activeParticipationSummaries = useMemo(() => {
    const expectedPhase = currentCall?.status === "post_maintenance" ? "follow_up" : "maintenance";
    return participationSummaries.filter(
      (summary) => summary.activeSession && summary.activePhase === expectedPhase,
    );
  }, [currentCall?.status, participationSummaries]);
  const maintenanceCompletionAuthorization = useMemo(
    () =>
      workstationRestrictionContext
        ? evaluateMaintenanceCompletionAuthorization(sessions, workstationRestrictionContext)
        : null,
    [sessions, workstationRestrictionContext],
  );
  const maintenanceCompletionHint = useMemo(() => {
    if (workstationAuthorizationLoadFailed) {
      return "Não foi possível verificar a autorização desta workstation. A validação será feita ao concluir.";
    }
    if (!maintenanceCompletionAuthorization) return null;
    if (!maintenanceCompletionAuthorization.allowed)
      return maintenanceCompletionAuthorization.message;
    if (maintenanceCompletionAuthorization.kind === "legacy") {
      return "Atendimento legado: conclusão permitida.";
    }
    return null;
  }, [maintenanceCompletionAuthorization, workstationAuthorizationLoadFailed]);
  const maintenanceCompletionHintTone = workstationAuthorizationLoadFailed
    ? "warning"
    : maintenanceCompletionAuthorization?.allowed
      ? "success"
      : "danger";
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
    soundScope: "machine",
  });

  function handleMachineAudioUnlock() {
    unlockAudio();
    setAudioUnlocked(true);
    toast.success("Som da máquina ativado nesta workstation");
  }

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

  async function handleCancelCall(reason: string) {
    if (!cancelCallId || !machine) return;
    try {
      await cancelCall({
        callId: cancelCallId,
        reason,
        cancelledBy: "operador",
      });
      toast.success("Chamado cancelado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não é possível cancelar chamado já atendido.",
      );
      throw error;
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

  async function handleReturnToMaintenance() {
    if (!currentCall) return;
    try {
      await returnToMaintenance(currentCall.id);
      toast.success("Chamado voltou à manutenção.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao retornar à manutenção");
    }
  }


  async function handleCompleteMaintenance() {
    if (!currentCall || isCompletingMaintenance) return;
    setIsCompletingMaintenance(true);
    try {
      await completeMaintenance(currentCall.id);
      toast.success("Manutenção concluída. Acompanhamento iniciado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao concluir manutenção");
    } finally {
      setIsCompletingMaintenance(false);
    }
  }

  async function handleOpenSubtype(subtype: CallSubtype) {
    if (!machine) return;

    setSelectedSubtype(subtype);

    if (machine.machineStatus !== "stopped" || !hasActiveStopOwner) {
      setForcedMachineCondition(undefined);
      setConditionDialogOpen(true);
      return;
    }

    try {
      const systemSettings = await getSystemSettings();
      if (
        resolveWorkOrderRequirement(
          systemSettings.requireWorkOrderAtOpen,
          machine.requireWorkOrderAtOpen === true,
        )
      ) {
        setForcedMachineCondition("stopped");
        setConditionDialogOpen(true);
        return;
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível carregar a regra da OS",
      );
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
      {!audioUnlocked && (
        <div className="flex shrink-0 flex-col items-center justify-between gap-2 rounded-xl border-2 border-warning bg-warning/10 px-3 py-1.5 text-warning sm:flex-row">
          <span className="text-sm font-bold">
            Ative o áudio desta workstation para receber os alertas sonoros desta máquina.
          </span>
          <BigButton tone="primary" size="md" onClick={handleMachineAudioUnlock}>
            ATIVAR SOM DA MÁQUINA
          </BigButton>
        </div>
      )}

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
            stopAndonSound(machine.id, "machine");
            toast.success("Som do ANDON silenciado somente nesta máquina");
            return;
          }

          if (latestOpenCall && settings.soundsEnabled && audioUnlocked) {
            const config = soundConfigs.find((item) => item.key === latestOpenCall.subtype);
            const repeatInterval = config?.repeatUntilAttended ? config.repeatIntervalSeconds : 0;
            void playAndonSound(
              machine.id,
              latestOpenCall.subtype,
              repeatInterval,
              "machine",
              true,
            );
          }
          toast.success("Som do ANDON ativado somente para esta máquina");
        }}
      />

      <ProductionSchedulePanel
        machine={machine}
        onChange={(productionMode) => updateMachineProductionMode(machine.id, productionMode)}
      />

      <div className="grid min-h-[200px] flex-1 grid-cols-1 items-stretch gap-1.5 overflow-hidden xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <MachineCurrentStatusPanel
          machine={machine}
          calls={calls}
          compactNormal={!currentCall && machine.machineStatus === "running"}
        />
        <MachineCurrentCallPanel
          call={currentCall}
          compactEmpty={!currentCall && machine.machineStatus === "running"}
          currentMachineStatus={machine.machineStatus}
        />
      </div>

      {(currentCall?.status === "in_progress" || currentCall?.status === "post_maintenance") &&
        requiresTechnician && (
          <section className="rounded-xl border border-border bg-card px-2.5 py-2 shadow-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="mr-auto text-xs font-bold uppercase tracking-wider text-muted-foreground md:text-sm">
                {currentCall.status === "post_maintenance" ? "Acompanhamento" : "Atendimento"}
              </h3>
              <div className="grid min-w-[300px] flex-1 grid-cols-2 gap-1.5 md:max-w-xl">
                <BigButton
                  tone="info"
                  size="md"
                  className="min-h-8 px-2.5 text-[11px] shadow-none md:text-xs"
                  onClick={() => setAddOpen(true)}
                >
                  {currentCall.status === "post_maintenance"
                    ? "Adicionar acompanhamento"
                    : "Adicionar mantenedor"}
                </BigButton>
                <BigButton
                  tone="warning"
                  size="md"
                  className="min-h-8 px-2.5 text-[11px] shadow-none md:text-xs"
                  disabled={activeSessions.length === 0}
                  onClick={() => setEndOpen(true)}
                >
                  {currentCall.status === "post_maintenance"
                    ? "Encerrar acompanhamento"
                    : "Encerrar atendimento"}
                </BigButton>
              </div>
            </div>

            {activeParticipationSummaries.length === 0 ? (
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground">
                <span>Nenhum mantenedor ativo.</span>
                {currentCall.status === "in_progress" && (
                  <strong className="whitespace-nowrap text-warning">
                    {formatDurationMinutes(timeWithoutTechnicianMinutes)}
                  </strong>
                )}
              </div>
            ) : (
              <div
                className="mt-1.5 grid gap-1.5"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
              >
                {activeParticipationSummaries.map((summary) => {
                  const phase = summary.activePhase ?? "maintenance";
                  const phaseMinutes = getTechnicianPhaseAccumulatedMinutes(summary, phase);
                  const isFollowUp = phase === "follow_up";

                  return (
                    <div
                      key={summary.key}
                      className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-2.5 py-1.5"
                    >
                      <span className="min-w-0 truncate text-sm font-bold text-foreground">
                        {summary.technicianName}
                      </span>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground md:text-[11px]">
                          {isFollowUp ? "Acompanhamento" : "Atendimento"}
                        </div>
                        <strong
                          className={cn(
                            "whitespace-nowrap font-mono text-base font-black md:text-lg 2xl:text-xl",
                            isFollowUp ? "text-success" : "text-info",
                          )}
                        >
                          {formatDurationMinutes(phaseMinutes)}
                        </strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

      <MachineActionPanel
        machine={machine}
        currentCall={currentCall}
        categories={categories}
        activeCalls={activeCalls}
        selectedCallId={selectedCallId}
        hasActiveStopOwner={hasActiveStopOwner}
        onOpenSubtype={(subtype) => void handleOpenSubtype(subtype)}
        onSelectCall={setSelectedCallId}
        onAttend={() => void handleAttend()}
        onCancelCall={() => currentCall && setCancelCallId(currentCall.id)}
        onFinish={() => currentCall && setFinishCallId(currentCall.id)}
        onCompleteMaintenance={() => void handleCompleteMaintenance()}
        onReturnToMaintenance={() => void handleReturnToMaintenance()}
        maintenanceCompletionDisabled={
          maintenanceCompletionAuthorization?.allowed === false || isCompletingMaintenance
        }
        maintenanceCompletionHint={maintenanceCompletionHint}
        maintenanceCompletionHintTone={maintenanceCompletionHintTone}
      />

      <QuickOpenCallModal
        open={conditionDialogOpen}
        onOpenChange={(open) => {
          setConditionDialogOpen(open);
          if (!open) setForcedMachineCondition(undefined);
        }}
        machineId={machine.id}
        subtype={selectedSubtype}
        forcedMachineCondition={forcedMachineCondition}
      />
      <CancelCallModal
        open={cancelCallId !== null}
        onOpenChange={(open) => !open && setCancelCallId(null)}
        onConfirm={handleCancelCall}
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
        phase={currentCall?.status === "post_maintenance" ? "follow_up" : "maintenance"}
      />
    </div>
  );
}
