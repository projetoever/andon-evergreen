import { useEffect, useEffectEvent, useRef, useState } from "react";
import { CircleHelp, CreditCard, Hash } from "lucide-react";
import { toast } from "sonner";

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
import {
  identifyTechnicianConfig,
  type TechnicianCredentialMethod,
} from "@/services/technicianConfigService";
import type { TechnicianAttendanceSession, TechnicianSessionEndReason } from "@/types/andon";
import type { AttendanceMode, SystemSettings } from "@/types/systemSettings";

interface EndTechnicianSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string | null;
  sessions: TechnicianAttendanceSession[];
}

function methodLabel(method: AttendanceMode) {
  if (method === "pin") return "PIN";
  if (method === "rfid") return "tag RF";
  return "nome";
}

export function EndTechnicianSessionModal({
  open,
  onOpenChange,
  callId,
  sessions,
}: EndTechnicianSessionModalProps) {
  const { endTechnicianSession } = useAndon();
  const activeSessions = sessions.filter((session) => !session.endedAt);
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
    setReason("support_finished");
    setNotes("");
    setShowNotes(false);
    setShowAlternatives(false);
    setIsSubmitting(false);
    submittingRef.current = false;

    getSystemSettings()
      .then((systemSettings) => {
        setSettings(systemSettings);
        setMethod(systemSettings.attendanceMode);
      })
      .catch((error) => {
        setLoadFailed(true);
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o modo de atendimento",
        );
      });
  }, [activeSessions, callId, open]);

  async function finishSession(
    target: TechnicianAttendanceSession,
    credential?: {
      method: TechnicianCredentialMethod;
      value: string;
    },
    submissionAlreadyStarted = false,
  ) {
    if (!callId || (!submissionAlreadyStarted && submittingRef.current)) return;
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
      toast.success(`Atendimento de ${target.technicianName} encerrado`);
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
      submittingRef.current
    ) {
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const value = credentialValue.trim();
      const technician = await identifyTechnicianConfig(method, value);
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

  const allowedMethods: AttendanceMode[] =
    settings?.attendanceMode === "name" ? ["name", "pin", "rfid"] : ["pin", "rfid"];

  return (
    <Dialog open={open} onOpenChange={(value) => !isSubmitting && onOpenChange(value)}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <DialogTitle className="text-2xl sm:text-3xl">
                Encerrar atendimento individual
              </DialogTitle>
              <DialogDescription className="mt-1 text-base">
                {method === "name"
                  ? "Selecione o mantenedor e encerre."
                  : `Digite o ${methodLabel(method)} e pressione Enter ou Encerrar.`}
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label="Outras formas de identificação"
              title="Outras formas de identificação"
              onClick={() => setShowAlternatives((value) => !value)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary hover:bg-accent"
            >
              <CircleHelp className="h-6 w-6" />
            </button>
          </div>
        </DialogHeader>

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
                  ? "Lista de nomes"
                  : candidate === "pin"
                    ? "Usar PIN"
                    : "Usar tag"}
              </button>
            ))}
          </div>
        )}

        {!settings && !loadFailed && (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Carregando modo de atendimento...
          </p>
        )}
        {loadFailed && (
          <p className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            Não foi possível validar o modo de atendimento. Feche e abra novamente.
          </p>
        )}
        {settings && activeSessions.length === 0 && (
          <p className="rounded-xl border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">
            Não há mantenedor ativo para encerrar.
          </p>
        )}

        {settings && activeSessions.length > 0 && method === "name" && (
          <label className="block text-sm font-bold">
            Mantenedor em atendimento
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
            {method === "pin" ? "PIN do mantenedor" : "Aproxime a tag no leitor"}
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
                placeholder={method === "pin" ? "4 a 8 números" : "Aguardando leitura..."}
              />
            </div>
          </label>
        )}

        {settings && activeSessions.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-sm font-bold">
              Motivo
              <select
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={reason}
                onChange={(event) => setReason(event.target.value as TechnicianSessionEndReason)}
              >
                <option value="support_finished">Apoio encerrado</option>
                <option value="handover">Troca de turno</option>
                <option value="transferred">Serviço transferido</option>
                <option value="break">Intervalo</option>
                <option value="other">Outro</option>
              </select>
            </label>
            <button
              type="button"
              className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-bold hover:bg-accent"
              onClick={() => setShowNotes((value) => !value)}
            >
              {showNotes ? "Ocultar observação" : "Adicionar observação"}
            </button>
          </div>
        )}

        {showNotes && (
          <label className="block text-sm font-bold">
            Observação (opcional)
            <Textarea
              className="mt-1"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Descreva a condição deixada para o próximo mantenedor."
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
            Cancelar
          </BigButton>
          <BigButton
            tone="warning"
            size="md"
            onClick={() => (method === "name" ? handleNameSubmit() : void handleCredentialSubmit())}
            disabled={
              !settings ||
              loadFailed ||
              activeSessions.length === 0 ||
              isSubmitting ||
              (method === "name" ? !sessionId : !credentialValue.trim())
            }
          >
            {isSubmitting ? "Encerrando..." : "Encerrar atendimento"}
          </BigButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
