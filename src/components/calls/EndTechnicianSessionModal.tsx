import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { CircleHelp, CreditCard, Hash } from "lucide-react";
import { toast } from "@/i18n/toast";

import { BigButton } from "@/components/common/BigButton";
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
import { cn } from "@/lib/utils";
import { getSystemSettings } from "@/services/systemSettingsService";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { allowedAttendanceModes, effectiveAttendanceMode } from "@/utils/attendanceModePolicy";
import {
  identifyTechnicianConfig,
  type TechnicianCredentialMethod,
} from "@/services/technicianConfigService";
import type {
  TechnicianAttendanceSession,
  TechnicianSessionEndReason,
  TechnicianSessionPhase,
} from "@/types/andon";
import type { AttendanceMode, SystemSettings } from "@/types/systemSettings";

interface EndTechnicianSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string | null;
  sessions: TechnicianAttendanceSession[];
  phase?: TechnicianSessionPhase;
}

function methodLabel(method: AttendanceMode) {
  if (method === "pin") return "PIN";
  if (method === "rfid") return ui("tag RF");
  return ui("nome");
}

export function EndTechnicianSessionModal({
  open,
  onOpenChange,
  callId,
  sessions,
  phase,
}: EndTechnicianSessionModalProps) {
  useInterfaceLanguage();
  const { endTechnicianSession } = useAndon();
  const activeSessions = sessions.filter((session) => !session.endedAt);
  const isFollowUp =
    phase !== undefined
      ? phase === "follow_up"
      : activeSessions.some((session) => session.phase === "follow_up");
  // The dialog must explain why the final individual exit is disabled.
  // The backend repeats this check under the machine transaction lock.
  const lastActiveMaintenanceTechnician = !isFollowUp && activeSessions.length === 1;
  const { access } = useModuleAccess();
  const centralAttendance = access?.centralAccessEnabled === true;
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [method, setMethod] = useState<AttendanceMode>("name");
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [credentialValue, setCredentialValue] = useState("");
  const [reason, setReason] = useState<TechnicianSessionEndReason>("support_finished");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initializedCallRef = useRef<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open || !callId) {
      initializedCallRef.current = null;
      return;
    }
    if (initializedCallRef.current === callId) return;
    initializedCallRef.current = callId;
    setSettings(null);
    setLoadFailed(false);
    setSessionId(activeSessions[0]?.id ?? "");
    setCredentialValue("");
    setReason(isFollowUp ? "follow_up_finished" : "support_finished");
    setNotes("");
    setShowNotes(false);
    setShowAlternatives(false);
    setIsSubmitting(false);
    submittingRef.current = false;

    getSystemSettings()
      .then((systemSettings) => {
        setSettings(systemSettings);
        setMethod(effectiveAttendanceMode(systemSettings.attendanceMode, centralAttendance));
      })
      .catch((error) => {
        setLoadFailed(true);
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o modo de atendimento",
        );
      });
  }, [activeSessions, callId, isFollowUp, open, centralAttendance]);

  async function finishSession(
    target: TechnicianAttendanceSession,
    credential?: {
      method: TechnicianCredentialMethod;
      value: string;
    },
    submissionAlreadyStarted = false,
  ) {
    if (!callId || (!submissionAlreadyStarted && submittingRef.current)) return;
    if (lastActiveMaintenanceTechnician) {
      toast.error(ui("Não é possível encerrar o último mantenedor enquanto o chamado estiver em atendimento. Adicione outro mantenedor ou conclua a manutenção para iniciar o acompanhamento."));
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await endTechnicianSession({
        callId,
        sessionId: target.id,
        technicianName: target.technicianName,
        credential,
        endReason: reason,
        notes: notes.trim() || null,
      });
      toast.success(
        isFollowUp
          ? `Acompanhamento de ${target.technicianName} encerrado`
          : `Atendimento de ${target.technicianName} encerrado`,
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível encerrar o atendimento",
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      setCredentialValue("");
    }
  }

  async function handleCredentialSubmit() {
    if (
      (method !== "pin" && method !== "rfid") ||
      !credentialValue.trim() ||
      submittingRef.current ||
      lastActiveMaintenanceTechnician
    ) {
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const value = credentialValue.trim();
      if (!callId) throw new Error("Chamado não identificado");
      const technician = await identifyTechnicianConfig(method, value, callId);
      const target = activeSessions.find(
        (session) =>
          session.technicianId === technician.id ||
          session.technicianName.toLocaleLowerCase("pt-BR") ===
            technician.name.toLocaleLowerCase("pt-BR"),
      );
      if (!target) throw new Error(`${technician.name} não possui atendimento ativo neste chamado`);
      await finishSession(target, technician.credential, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Credencial não reconhecida");
      setCredentialValue("");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  function handleNameSubmit() {
    if (centralAttendance) return;
    const target = activeSessions.find((session) => session.id === sessionId);
    if (target) void finishSession(target);
  }

  const submitFixedLengthCredential = useEffectEvent(handleCredentialSubmit);

  useEffect(() => {
    if (
      method === "rfid" &&
      settings?.rfidInputTerminator === "fixed_length" &&
      settings.rfidCodeLength &&
      credentialValue.length === settings.rfidCodeLength &&
      !isSubmitting
    ) {
      void submitFixedLengthCredential();
    }
  }, [
    credentialValue,
    isSubmitting,
    method,
    settings?.rfidCodeLength,
    settings?.rfidInputTerminator,
    submitFixedLengthCredential,
  ]);

  const allowedMethods: AttendanceMode[] = allowedAttendanceModes(
    settings?.attendanceMode, centralAttendance,
  );

  return (
    <Dialog open={open} onOpenChange={(value) => !isSubmitting && onOpenChange(value)}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <DialogTitle className="text-2xl sm:text-3xl">
                {isFollowUp
                  ? ui("Encerrar acompanhamento individual")
                  : ui("Encerrar atendimento individual")}
              </DialogTitle>
              <DialogDescription className="mt-1 text-base">
                {method === "name"
                  ? ui("Selecione o mantenedor e encerre {0}.", {
                      0: isFollowUp ? "o acompanhamento" : "o atendimento",
                    })
                  : ui("Digite o {0} e pressione Enter ou Encerrar.", { 0: methodLabel(method) })}
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label={ui("Outras formas de identificação")}
              title={ui("Outras formas de identificação")}
              onClick={() => setShowAlternatives((value) => !value)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary hover:bg-accent"
            >
              <CircleHelp className="h-6 w-6" />
            </button>
          </div>
        </DialogHeader>

        {centralAttendance && settings?.attendanceMode === "name" && (
          <p role="status" className="rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm font-semibold text-foreground">
            {ui("No login central, identifique o mantenedor por PIN ou tag. A seleção por nome permanece disponível somente no modo legado.")}
          </p>
        )}

        {showAlternatives && (
          <div className="grid gap-2 rounded-xl border border-info/30 bg-info/10 p-2 sm:grid-cols-3">
            {allowedMethods.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => {
                  setMethod(candidate);
                  setCredentialValue("");
                  setShowAlternatives(false);
                }}
                className={cn(
                  "min-h-11 rounded-lg border px-3 text-sm font-black",
                  method === candidate
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-accent",
                )}
              >
                {candidate === "name"
                  ? ui("Lista de nomes")
                  : candidate === "pin"
                    ? ui("Usar PIN")
                    : ui("Usar tag")}
              </button>
            ))}
          </div>
        )}

        {!settings && !loadFailed && (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {ui("Carregando modo de atendimento...")}
          </p>
        )}
        {loadFailed && (
          <p className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {ui("Não foi possível validar o modo de atendimento. Feche e abra novamente.")}
          </p>
        )}
        {lastActiveMaintenanceTechnician && (
          <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm font-semibold text-foreground">
            {ui("Não é possível encerrar o último mantenedor enquanto o chamado estiver em atendimento. Adicione outro mantenedor ou conclua a manutenção para iniciar o acompanhamento.")}
          </p>
        )}
        {settings && activeSessions.length === 0 && (
          <p className="rounded-xl border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">
            {ui("Não há mantenedor ativo para encerrar.")}
          </p>
        )}

        {settings && activeSessions.length > 0 && method === "name" && (
          <label className="block text-sm font-bold">
            {isFollowUp ? ui("Mantenedor em acompanhamento") : ui("Mantenedor em atendimento")}
            <select
              autoFocus
              className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
            >
              {activeSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.technicianName}
                </option>
              ))}
            </select>
          </label>
        )}

        {settings && activeSessions.length > 0 && (method === "pin" || method === "rfid") && (
          <label className="block text-sm font-bold">
            {method === "pin" ? ui("PIN do mantenedor") : ui("Aproxime a tag no leitor")}
            <div className="mt-1 flex min-w-0 gap-2">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-warning">
                {method === "pin" ? (
                  <Hash className="h-6 w-6" />
                ) : (
                  <CreditCard className="h-6 w-6" />
                )}
              </span>
              <input
                autoFocus
                type={method === "pin" ? "password" : "text"}
                inputMode={method === "pin" ? "numeric" : "text"}
                autoComplete="off"
                className="h-12 min-w-0 flex-1 rounded-xl border bg-background px-3 font-mono text-lg"
                value={credentialValue}
                onChange={(event) =>
                  setCredentialValue(
                    method === "pin" ? event.target.value.replace(/\D/g, "") : event.target.value,
                  )
                }
                onKeyDown={(event) => {
                  const shouldSubmit =
                    event.key === "Enter" ||
                    (event.key === "Tab" && settings.rfidInputTerminator === "tab");
                  if (shouldSubmit) {
                    event.preventDefault();
                    void handleCredentialSubmit();
                  }
                }}
                maxLength={method === "pin" ? 8 : 64}
                placeholder={method === "pin" ? ui("4 a 8 números") : ui("Aguardando leitura...")}
              />
            </div>
          </label>
        )}

        {settings && activeSessions.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-sm font-bold">
              {ui("Motivo")}
              <select
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={reason}
                onChange={(event) => setReason(event.target.value as TechnicianSessionEndReason)}
              >
                {isFollowUp && (
                  <option value="follow_up_finished">{ui("Acompanhamento encerrado")}</option>
                )}
                {!isFollowUp && <option value="support_finished">{ui("Apoio encerrado")}</option>}
                <option value="handover">{ui("Troca de turno")}</option>
                <option value="transferred">{ui("Serviço transferido")}</option>
                <option value="break">{ui("Intervalo")}</option>
                <option value="other">{ui("Outro")}</option>
              </select>
            </label>
            <button
              type="button"
              className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-bold hover:bg-accent"
              onClick={() => setShowNotes((value) => !value)}
            >
              {showNotes ? ui("Ocultar observação") : ui("Adicionar observação")}
            </button>
          </div>
        )}

        {showNotes && (
          <label className="block text-sm font-bold">
            {ui("Observação (opcional)")}
            <Textarea
              className="mt-1"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={ui("Descreva a condição deixada para o próximo mantenedor.")}
            />
          </label>
        )}

        <DialogFooter className="gap-2">
          <BigButton
            tone="neutral"
            size="md"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {ui("Cancelar")}
          </BigButton>
          <BigButton
            tone="warning"
            size="md"
            onClick={() => (method === "name" ? handleNameSubmit() : void handleCredentialSubmit())}
            disabled={
              !settings ||
              loadFailed ||
              activeSessions.length === 0 ||
              lastActiveMaintenanceTechnician ||
              isSubmitting ||
              (method === "name" ? !sessionId : !credentialValue.trim())
            }
          >
            {isSubmitting
              ? ui("Encerrando...")
              : isFollowUp
                ? ui("Encerrar acompanhamento")
                : ui("Encerrar atendimento")}
          </BigButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
