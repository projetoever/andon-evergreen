import { useEffect, useMemo, useState } from "react";
import { useAndon } from "@/context/AndonProvider";
import { MachineDetailHeader } from "@/components/machines/MachineDetailHeader";
import { MachineCurrentStatusPanel } from "@/components/machines/MachineCurrentStatusPanel";
import { MachineCurrentCallPanel } from "@/components/machines/MachineCurrentCallPanel";
import { MachineActionPanel } from "@/components/machines/MachineActionPanel";
import { ProductionSchedulePanel } from "@/components/machines/ProductionSchedulePanel";
import { OpenCallModal } from "@/components/calls/OpenCallModal";
import { FinishCallModal } from "@/components/calls/FinishCallModal";
import { EmptyState } from "@/components/common/EmptyState";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { isMachineSoundEnabled, setMachineSoundEnabled } from "@/services/machineSoundPreferenceService";
import { playAndonSound, stopAndonSound } from "@/services/soundService";
import { getCallTypeOption } from "@/data/callTypes";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TechnicianSelector } from "@/components/calls/TechnicianSelector";
import { BigButton } from "@/components/common/BigButton";
import { Textarea } from "@/components/ui/textarea";
import { diffMinutes, formatDurationMinutes } from "@/utils/durationUtils";

export function MachineDetailPage({ machineId }: { machineId: string }) {
  const { machines, calls, attendCall, addTechnicianSessions, endTechnicianSession, completeMaintenance, returnToMaintenance, changeMachineStatus, updateMachineProductionMode, soundConfigs, settings, audioUnlocked } = useAndon();
  const machine = machines.find((m) => m.id === machineId);
  const [openCallDialog, setOpenCallDialog] = useState(false); const [finishCallId, setFinishCallId] = useState<string | null>(null); const [machineSoundEnabled, setMachineSoundEnabledState] = useState(true);
  const [startOpen, setStartOpen] = useState(false); const [addOpen, setAddOpen] = useState(false); const [endOpen, setEndOpen] = useState(false);
  const [names, setNames] = useState<string[]>([]); const [notes, setNotes] = useState(""); const [endNotes, setEndNotes] = useState(""); const [endReason, setEndReason] = useState("handover"); const [sessionId, setSessionId] = useState("");
  if (!machine) return <EmptyState icon={<AlertCircle className="h-10 w-10" />} title="Máquina não encontrada" description={`A máquina "${machineId}" não existe.`} />;
  useEffect(() => { setMachineSoundEnabledState(isMachineSoundEnabled(machine.id)); }, [machine.id]);
  const currentCall = machine.currentCallId ? (calls.find((c) => c.id === machine.currentCallId) ?? null) : null;
  const activeSessions = currentCall?.technicianSessions?.filter((s) => !s.endedAt) ?? [];
  const area = currentCall ? getCallTypeOption(currentCall.subtype)?.technicianArea : null;
  const nowTick = Date.now();

  function handleAttend() { if (!currentCall) return; setNames([]); setNotes(""); setStartOpen(true); }
  function resolveSelected() { const configs = JSON.parse(localStorage.getItem("andonTechniciansConfig") ?? "[]") as any[]; return names.map((name) => { const c = configs.find((t) => t.name === name); return { name, id: c?.id, shiftId: c?.shiftId, shiftName: c?.shiftId, technicalArea: c?.area ?? area ?? undefined }; }); }
  function confirmStart() { if (!currentCall || names.length===0) return toast.error("Selecione ao menos um manutentor"); attendCall({ callId: currentCall.id, technicians: resolveSelected(), notes }); setStartOpen(false); toast.success("Chamado em atendimento"); }
  function confirmAdd() { if (!currentCall || names.length===0) return toast.error("Selecione ao menos um manutentor"); addTechnicianSessions({ callId: currentCall.id, technicians: resolveSelected() }); setAddOpen(false); toast.success("Manutentor adicionado"); }
  function confirmEnd() { if (!currentCall || !sessionId) return; endTechnicianSession({ callId: currentCall.id, sessionId, notes: endNotes, endReason: endReason as any }); setEndOpen(false); toast.success("Atendimento individual encerrado"); }

  return <div className="space-y-3"><MachineDetailHeader machine={machine} machineSoundEnabled={machineSoundEnabled} onToggleMachineSound={() => { const next = !machineSoundEnabled; setMachineSoundEnabled(machine.id, next); setMachineSoundEnabledState(next); if (!next) { stopAndonSound(machine.id); toast.success("Som do ANDON silenciado para esta máquina"); return; } const shouldReplay = currentCall?.status === "open" && settings.soundsEnabled && audioUnlocked; if (shouldReplay) { const cfg = soundConfigs.find((item) => item.key === currentCall.subtype); const repeatInterval = cfg?.repeatUntilAttended ? cfg.repeatIntervalSeconds : 0; void playAndonSound(machine.id, currentCall.subtype, repeatInterval); } toast.success("Som do ANDON ativado para esta máquina"); }} /><ProductionSchedulePanel machine={machine} onChange={(pm)=>updateMachineProductionMode(machine.id, pm)} /><div className="grid grid-cols-1 gap-3 xl:grid-cols-2"><MachineCurrentStatusPanel machine={machine} /><MachineCurrentCallPanel call={currentCall} /></div>
  {currentCall?.status==="in_progress" && <section className="rounded-xl border p-3"><h3 className="font-bold">Atendimento por manutentor</h3>{activeSessions.length===0?<p className="text-sm text-muted-foreground">Nenhum manutentor ativo no momento. Adicione um manutentor ou finalize a ocorrência.</p>:<div className="grid gap-2 md:grid-cols-2">{activeSessions.map((s)=><div key={s.id} className="rounded border p-2 text-sm"><div className="font-semibold">{s.technicianName}</div><div>Turno: {s.shiftName ?? "Não informado"}</div><div>Tempo: {formatDurationMinutes(diffMinutes(s.startedAt, new Date(nowTick).toISOString()))}</div></div>)}</div>}<div className="mt-2 flex gap-2"><BigButton tone="info" size="sm" onClick={()=>{setNames([]);setAddOpen(true);}}>Adicionar manutentor</BigButton><BigButton tone="warning" size="sm" onClick={()=>{setSessionId(activeSessions[0]?.id ?? "");setEndNotes("");setEndOpen(true);}}>Encerrar atendimento individual</BigButton></div></section>}
  <MachineActionPanel machine={machine} currentCall={currentCall} onOpenCall={() => setOpenCallDialog(true)} onAttend={handleAttend} onFinish={() => currentCall && setFinishCallId(currentCall.id)} onCompleteMaintenance={() => currentCall && completeMaintenance(currentCall.id)} onReturnToMaintenance={() => currentCall && returnToMaintenance(currentCall.id)} onStop={() => changeMachineStatus(machine.id, "stopped")} onResume={() => changeMachineStatus(machine.id, "running")} />
  <OpenCallModal open={openCallDialog} onOpenChange={setOpenCallDialog} preselectedMachineId={machine.id} />
  <FinishCallModal open={finishCallId !== null} onOpenChange={(o) => !o && setFinishCallId(null)} callId={finishCallId} />
  <Dialog open={startOpen} onOpenChange={setStartOpen}><DialogContent><DialogHeader><DialogTitle>Iniciar atendimento</DialogTitle></DialogHeader>{area && <TechnicianSelector area={area} value={names} onChange={setNames} />}<Textarea placeholder="Observação inicial opcional" value={notes} onChange={(e)=>setNotes(e.target.value)} /><DialogFooter><BigButton tone="neutral" size="sm" onClick={()=>setStartOpen(false)}>Cancelar</BigButton><BigButton tone="success" size="sm" onClick={confirmStart}>Iniciar atendimento</BigButton></DialogFooter></DialogContent></Dialog>
  <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent><DialogHeader><DialogTitle>Adicionar manutentor</DialogTitle></DialogHeader>{area && <TechnicianSelector area={area} value={names} onChange={setNames} excludeNames={activeSessions.map((s)=>s.technicianName)} />}<DialogFooter><BigButton tone="neutral" size="sm" onClick={()=>setAddOpen(false)}>Cancelar</BigButton><BigButton tone="success" size="sm" onClick={confirmAdd}>Adicionar</BigButton></DialogFooter></DialogContent></Dialog>
  <Dialog open={endOpen} onOpenChange={setEndOpen}><DialogContent><DialogHeader><DialogTitle>Encerrar atendimento individual</DialogTitle></DialogHeader><select className="rounded border p-2" value={sessionId} onChange={(e)=>setSessionId(e.target.value)}>{activeSessions.map((s)=><option key={s.id} value={s.id}>{s.technicianName}</option>)}</select><select className="rounded border p-2" value={endReason} onChange={(e)=>setEndReason(e.target.value)}><option value="handover">Troca de turno</option><option value="support_finished">Apoio encerrado</option><option value="transferred">Serviço transferido</option><option value="break">Intervalo</option><option value="other">Outro</option></select><Textarea value={endNotes} onChange={(e)=>setEndNotes(e.target.value)} placeholder="Observação"/><DialogFooter><BigButton tone="neutral" size="sm" onClick={()=>setEndOpen(false)}>Cancelar</BigButton><BigButton tone="success" size="sm" onClick={confirmEnd}>Encerrar</BigButton></DialogFooter></DialogContent></Dialog>
  </div>;
}
