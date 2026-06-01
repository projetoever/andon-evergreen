import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAndon } from "@/context/AndonProvider";
import { getCallTypeOption } from "@/data/callTypes";
import { MachineDetailHeader } from "@/components/machines/MachineDetailHeader";
import { MachineCurrentStatusPanel } from "@/components/machines/MachineCurrentStatusPanel";
import { MachineCurrentCallPanel } from "@/components/machines/MachineCurrentCallPanel";
import { MachineActionPanel } from "@/components/machines/MachineActionPanel";
import { ProductionSchedulePanel } from "@/components/machines/ProductionSchedulePanel";
import { OpenCallModal } from "@/components/calls/OpenCallModal";
import { FinishCallModal } from "@/components/calls/FinishCallModal";
import { TechnicianSelector } from "@/components/calls/TechnicianSelector";
import { EmptyState } from "@/components/common/EmptyState";
import { BigButton } from "@/components/common/BigButton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { diffMinutes, formatDurationMinutes } from "@/utils/durationUtils";
import { formatShiftName } from "@/utils/technicianDisplayUtils";
import { isMachineSoundEnabled, setMachineSoundEnabled } from "@/services/machineSoundPreferenceService";
import { playAndonSound, stopAndonSound } from "@/services/soundService";
import { useTicker } from "@/hooks/useTicker";
import { requiresMaintenanceTechnician } from "@/utils/callTypeUtils";

export function MachineDetailPage({ machineId }: { machineId: string }) {
  const {
    machines,
    calls,
    attendCall,
    addTechnicianSessions,
    endTechnicianSession,
    completeMaintenance,
    returnToMaintenance,
    changeMachineStatus,
    updateMachineProductionMode,
    soundConfigs,
    settings,
    audioUnlocked,
  } = useAndon();

  const machine = machines.find((m) => m.id === machineId);
  const [openCallDialog, setOpenCallDialog] = useState(false);
  const [finishCallId, setFinishCallId] = useState<string | null>(null);
  const [machineSoundEnabled, setMachineSoundEnabledState] = useState(true);

  const [startOpen, setStartOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const [names, setNames] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [endNotes, setEndNotes] = useState("");
  const [endReason, setEndReason] = useState("handover");
  const [sessionId, setSessionId] = useState("");
  const tick = useTicker(1000);

  if (!machine) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-10 w-10" />}
        title="Máquina não encontrada"
        description={`A máquina "${machineId}" não existe.`}
      />
    );
  }

  useEffect(() => {
    setMachineSoundEnabledState(isMachineSoundEnabled(machine.id));
  }, [machine.id]);

  const currentCall = machine.currentCallId
    ? (calls.find((c) => c.id === machine.currentCallId) ?? null)
    : null;
  const nowIso = useMemo(() => new Date().toISOString(), [tick]);
  const sessions = useMemo(
    () =>
      (currentCall?.technicianSessions ?? [])
        .slice()
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()),
    [currentCall?.technicianSessions],
  );
  const activeSessions = sessions.filter((s) => !s.endedAt);
  const firstSessionStartedAt = sessions[0]?.startedAt ?? null;
  const hasLegacyUnassignedPeriod = Boolean(
    currentCall?.currentAttendanceStartedAt &&
      (!firstSessionStartedAt ||
        new Date(firstSessionStartedAt).getTime() - new Date(currentCall.currentAttendanceStartedAt).getTime() > 1000),
  );
  const area = currentCall ? getCallTypeOption(currentCall.subtype)?.technicianArea : null;
  const requiresTechnician = currentCall ? requiresMaintenanceTechnician(currentCall) : false;
  const timeWithoutTechnicianMinutes =
    currentCall?.status === "in_progress" && activeSessions.length === 0
      ? diffMinutes(currentCall.currentAttendanceStartedAt ?? currentCall.attendedAt, nowIso)
      : 0;

  function handleAttend() {
    if (!currentCall) return;
    setNames([]);
    setNotes("");

    if (!requiresMaintenanceTechnician(currentCall)) {
      try {
        attendCall({ callId: currentCall.id, technicians: [] });
        toast.success("Chamado em atendimento");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atender chamado");
      }
      return;
    }

    setStartOpen(true);
  }

  function resolveSelected() {
    const configs = JSON.parse(localStorage.getItem("andonTechniciansConfig") ?? "[]") as any[];
    return names.map((name) => {
      const config = configs.find((t) => t.name === name);
      return {
        name,
        id: config?.id,
        shiftId: config?.shiftId,
        shiftName: config?.shiftId,
        technicalArea: config?.area ?? area ?? undefined,
      };
    });
  }

  function confirmStart() {
    if (!currentCall) return;
    if (requiresTechnician && names.length === 0) {
      toast.error("Selecione pelo menos um manutentor para iniciar o atendimento.");
      return;
    }
    attendCall({ callId: currentCall.id, technicians: requiresTechnician ? resolveSelected() : [], notes });
    setStartOpen(false);
    toast.success("Chamado em atendimento");
  }

  function confirmAdd() {
    if (!currentCall || names.length === 0) {
      toast.error("Selecione ao menos um manutentor");
      return;
    }
    addTechnicianSessions({ callId: currentCall.id, technicians: resolveSelected() });
    setAddOpen(false);
    toast.success("Manutentor adicionado");
  }

  function confirmEnd() {
    if (!currentCall || !sessionId) return;
    endTechnicianSession({
      callId: currentCall.id,
      sessionId,
      notes: endNotes,
      endReason: endReason as any,
    });
    setEndOpen(false);
    toast.success("Atendimento individual encerrado");
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col gap-2 overflow-hidden p-2 md:p-3">
      <MachineDetailHeader
        machine={machine}
        machineSoundEnabled={machineSoundEnabled}
        onToggleMachineSound={() => {
          const next = !machineSoundEnabled;
          setMachineSoundEnabled(machine.id, next);
          setMachineSoundEnabledState(next);

          if (!next) {
            stopAndonSound(machine.id);
            toast.success("Som do ANDON silenciado para esta máquina");
            return;
          }

          const shouldReplay = currentCall?.status === "open" && settings.soundsEnabled && audioUnlocked;
          if (shouldReplay) {
            const cfg = soundConfigs.find((item) => item.key === currentCall.subtype);
            const repeatInterval = cfg?.repeatUntilAttended ? cfg.repeatIntervalSeconds : 0;
            void playAndonSound(machine.id, currentCall.subtype, repeatInterval);
          }

          toast.success("Som do ANDON ativado para esta máquina");
        }}
      />

      <ProductionSchedulePanel machine={machine} onChange={(pm) => updateMachineProductionMode(machine.id, pm)} />

      <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <MachineCurrentStatusPanel
          machine={machine}
          compactNormal={!currentCall && machine.machineStatus === "running"}
          className={!currentCall && machine.machineStatus === "running" ? "self-start" : undefined}
        />
        <MachineCurrentCallPanel call={currentCall} />
      </div>

      {currentCall?.status === "in_progress" && requiresTechnician && (
        <section className="rounded-xl border border-border bg-card p-3 shadow-md">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground md:text-base">
            Atendimento por manutentor
          </h3>

          {sessions.length === 0 ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
              Nenhum manutentor ativo no momento. Adicione um manutentor para registrar o tempo individual.
              <div className="mt-1 font-semibold text-foreground">
                Tempo sem manutentor apontado: {formatDurationMinutes(timeWithoutTechnicianMinutes)}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {hasLegacyUnassignedPeriod && currentCall.currentAttendanceStartedAt && (
                <div className="rounded-lg border border-dashed border-border bg-muted/10 p-2.5 text-xs">
                  <div className="text-sm font-bold text-foreground">Sem manutentor apontado</div>
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
                  {session.shiftName && <div className="text-muted-foreground">Turno: {formatShiftName(session.shiftName)}</div>}
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
              onClick={() => {
                setNames([]);
                setAddOpen(true);
              }}
            >
              Adicionar manutentor
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
        onOpenCall={() => setOpenCallDialog(true)}
        onAttend={handleAttend}
        onFinish={() => currentCall && setFinishCallId(currentCall.id)}
        onCompleteMaintenance={() => currentCall && completeMaintenance(currentCall.id)}
        onReturnToMaintenance={() => currentCall && returnToMaintenance(currentCall.id)}
        onStop={() => changeMachineStatus(machine.id, "stopped")}
        onResume={() => changeMachineStatus(machine.id, "running")}
      />

      <OpenCallModal open={openCallDialog} onOpenChange={setOpenCallDialog} preselectedMachineId={machine.id} />
      <FinishCallModal
        open={finishCallId !== null}
        onOpenChange={(isOpen) => !isOpen && setFinishCallId(null)}
        callId={finishCallId}
      />

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-3xl">Iniciar atendimento</DialogTitle>
            <DialogDescription className="text-base">
              Selecione os manutentores que iniciarão o atendimento deste chamado.
            </DialogDescription>
          </DialogHeader>

          {requiresTechnician && area && <TechnicianSelector area={area} value={names} onChange={setNames} />}

          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Observação inicial (opcional)
            </h4>
            <Textarea
              placeholder="Descreva o contexto inicial do atendimento."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-base"
            />
          </div>

          <DialogFooter className="gap-2">
            <BigButton tone="neutral" size="md" onClick={() => setStartOpen(false)}>
              Cancelar
            </BigButton>
            <BigButton tone="success" size="md" onClick={confirmStart}>
              Iniciar atendimento
            </BigButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-3xl">Adicionar manutentor ao atendimento</DialogTitle>
            <DialogDescription className="text-base">
              Selecione um ou mais manutentores para iniciar nova sessão de atendimento neste chamado.
            </DialogDescription>
          </DialogHeader>

          {area && (
            <TechnicianSelector
              area={area}
              value={names}
              onChange={setNames}
              excludeNames={activeSessions.map((session) => session.technicianName)}
            />
          )}

          <DialogFooter className="gap-2">
            <BigButton tone="neutral" size="md" onClick={() => setAddOpen(false)}>
              Cancelar
            </BigButton>
            <BigButton tone="info" size="md" onClick={confirmAdd} disabled={names.length === 0}>
              Adicionar manutentor
            </BigButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-3xl">Encerrar atendimento individual</DialogTitle>
            <DialogDescription className="text-base">
              Registre o encerramento do atendimento de um manutentor sem finalizar a ocorrência.
            </DialogDescription>
          </DialogHeader>

          {activeSessions.length === 0 ? (
            <div className="rounded-lg border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">
              Não há manutentor ativo para encerrar.
            </div>
          ) : (
            <>
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Manutentor em atendimento
                </h4>
                <select
                  className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                >
                  <option value="" disabled>
                    Selecione o manutentor
                  </option>
                  {activeSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.technicianName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Motivo do encerramento
                </h4>
                <select
                  className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
                  value={endReason}
                  onChange={(e) => setEndReason(e.target.value)}
                >
                  <option value="handover">Troca de turno</option>
                  <option value="support_completed">Apoio encerrado</option>
                  <option value="service_transferred">Serviço transferido</option>
                  <option value="break">Intervalo</option>
                  <option value="other">Outro</option>
                </select>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Observação
                </h4>
                <Textarea
                  value={endNotes}
                  onChange={(e) => setEndNotes(e.target.value)}
                  rows={4}
                  className="text-base"
                  placeholder="Descreva o que foi realizado ou a condição deixada para o próximo manutentor."
                />
              </div>
            </>
          )}

          <DialogFooter className="gap-2">
            <BigButton tone="neutral" size="md" onClick={() => setEndOpen(false)}>
              Cancelar
            </BigButton>
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
