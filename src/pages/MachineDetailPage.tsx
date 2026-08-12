import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { BigButton } from "@/components/common/BigButton";
import { EmptyState } from "@/components/common/EmptyState";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
import { playAndonSound, stopAndonSound } from "@/services/soundService";
import type { CallSubtype, TechnicianSessionEndReason } from "@/types/andon";
import { requiresMaintenanceTechnician } from "@/utils/callTypeUtils";
import { diffMinutes, formatDurationMinutes } from "@/utils/durationUtils";
import { formatShiftName } from "@/utils/technicianDisplayUtils";

const ACTIVE_STATUSES = new Set(["open", "in_progress", "post_maintenance"]);

export function MachineDetailPage({ machineId }: { machineId: string }) {
  const {
    machines,
    calls,
    attendCall,
    cancelCall,
    endTechnicianSession,
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
  const [selectedSubtypes, setSelectedSubtypes] = useState<CallSubtype[]>([]);
  const [conditionDialogOpen, setConditionDialogOpen] = useState(false);
  const [finishCallId, setFinishCallId] = useState<string | null>(null);
  const [machineSoundEnabled, setMachineSoundEnabledState] = useState(true);
  const [screenLock, setScreenLock] = useState(() => getMachineScreenLock());
  const [unlockLoginOpen, setUnlockLoginOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [endNotes, setEndNotes] = useState("");
  const [endReason, setEndReason] = useState<TechnicianSessionEndReason>("handover");
  const [sessionId, setSessionId] = useState("");
  const tick = useTicker(1000);

  const activeCalls = useMemo(
    () =>
      calls
        .filter(
          (call) =>
            call.machineId === machineId &&
            !call.isSystemTest &&
            ACTIVE_STATUSES.has(call.status),
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
    const preferred = activeCalls.find((call) => call.id === machine?.currentCallId) ?? activeCalls[0];
    setSelectedCallId(preferred.id);
  }, [activeCalls, machine?.currentCallId, selectedCallId]);

  const currentCall = selectedCallId
    ? activeCalls.find((call) => call.id === selectedCallId) ?? null
    : null;
  const activeSubtypes = useMemo(
    () => new Set(activeCalls.map((call) => call.subtype)),
    [activeCalls],
  );
  const latestOpenCall = activeCalls.find((call) => call.status === "open") ?? null;

  useEffect(() => {
    setSelectedSubtypes((current) => current.filter((subtype) => !activeSubtypes.has(subtype)));
  }, [activeSubtypes]);

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

  const nowIso = useMemo(() => new Date().toISOString(), [tick]);
  const sessions = useMemo(
    () =>
      (currentCall?.technicianSessions ?? [])
        .slice()
        .sort((current, next) =>
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

  function confirmEnd() {
    if (!currentCall || !sessionId) return;
    endTechnicianSession({
      callId: currentCall.id,
      sessionId,
      notes: endNotes,
      endReason,
    });
    setEndOpen(false);
    toast.success("Atendimento individual encerrado");
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
    <div className="flex h-dvh min-h-0 flex-col gap-2 overflow-x-hidden overflow-y-auto p-2 md:p-3">
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

      <div className="grid min-h-[220px] grid-cols-1 items-stretch gap-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
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
        <section className="rounded-xl border border-border bg-card p-3 shadow-md">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground md:text-base">
            Atendimento por mantenedor · chamado selecionado
          </h3>
          {sessions.length === 0 ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
              Nenhum mantenedor ativo no momento. Adicione um responsável para registrar o tempo individual.
              <div className="mt-1 font-semibold text-foreground">
                Tempo sem mantenedor apontado: {formatDurationMinutes(timeWithoutTechnicianMinutes)}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {hasLegacyUnassignedPeriod && currentCall.currentAttendanceStartedAt && (
                <div className="rounded-lg border border-dashed border-border bg-muted/10 p-2.5 text-xs">
                  <div className="text-sm font-bold text-foreground">Sem mantenedor apontado</div>
                  <div className="font-semibold text-info">
                    Tempo:{" "}
                    {formatDurationMinutes(
                      diffMinutes(
                        currentCall.currentAttendanceStartedAt,
                        sessions[0]?.startedAt ?? nowIso,
                      ),
                    )}
                  </div>
                </div>
              )}
              {activeSessions.map((session) => (
                <div key={session.id} className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
                  <div className="text-sm font-bold text-foreground">{session.technicianName}</div>
                  {session.shiftName && (
                    <div className="text-muted-foreground">Turno: {formatShiftName(session.shiftName)}</div>
                  )}
                  <div className="font-semibold text-info">
                    Tempo: {formatDurationMinutes(diffMinutes(session.startedAt, nowIso))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <BigButton
              tone="info"
              size="md"
              className="min-h-[40px] whitespace-nowrap px-3 text-xs shadow"
              onClick={() => setAddOpen(true)}
            >
              Adicionar mantenedor
            </BigButton>
            <BigButton
              tone="warning"
              size="md"
              className="min-h-[40px] whitespace-nowrap px-3 text-xs shadow"
              disabled={activeSessions.length === 0}
              onClick={() => {
                setSessionId(activeSessions[0]?.id ?? "");
                setEndReason("handover");
                setEndNotes("");
                setEndOpen(true);
              }}
            >
              Encerrar atendimento individual
            </BigButton>
          </div>
        </section>
      )}

      <MachineActionPanel
        machine={machine}
        currentCall={currentCall}
        selectedSubtypes={selectedSubtypes}
        activeSubtypes={activeSubtypes}
        onToggleSubtype={(subtype) =>
          setSelectedSubtypes((current) =>
            current.includes(subtype)
              ? current.filter((item) => item !== subtype)
              : [...current, subtype],
          )
        }
        onOpenSelected={() => setConditionDialogOpen(true)}
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
        subtypes={selectedSubtypes}
        onSuccess={() => setSelectedSubtypes([])}
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

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="text-3xl">Encerrar atendimento individual</DialogTitle>
            <DialogDescription className="text-base">
              Registre o encerramento de um mantenedor sem finalizar a ocorrência.
            </DialogDescription>
          </DialogHeader>

          {activeSessions.length === 0 ? (
            <div className="rounded-lg border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">
              Não há mantenedor ativo para encerrar.
            </div>
          ) : (
            <>
              <label className="text-sm font-bold">
                Mantenedor em atendimento
                <select
                  className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
                  value={sessionId}
                  onChange={(event) => setSessionId(event.target.value)}
                >
                  <option value="" disabled>Selecione o mantenedor</option>
                  {activeSessions.map((session) => (
                    <option key={session.id} value={session.id}>{session.technicianName}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold">
                Motivo do encerramento
                <select
                  className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
                  value={endReason}
                  onChange={(event) => setEndReason(event.target.value as TechnicianSessionEndReason)}
                >
                  <option value="handover">Troca de turno</option>
                  <option value="support_finished">Apoio encerrado</option>
                  <option value="transferred">Serviço transferido</option>
                  <option value="break">Intervalo</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              <label className="text-sm font-bold">
                Observação
                <Textarea
                  value={endNotes}
                  onChange={(event) => setEndNotes(event.target.value)}
                  rows={4}
                  className="mt-1 text-base"
                  placeholder="Descreva o que foi realizado ou a condição deixada para o próximo mantenedor."
                />
              </label>
            </>
          )}

          <DialogFooter className="gap-2">
            <BigButton tone="neutral" size="md" onClick={() => setEndOpen(false)}>Cancelar</BigButton>
            <BigButton
              tone="warning"
              size="md"
              onClick={confirmEnd}
              disabled={activeSessions.length === 0 || !sessionId}
            >
              Encerrar atendimento
            </BigButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
