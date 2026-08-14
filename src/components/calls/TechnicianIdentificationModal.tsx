import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
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
import { getCallTypeOption } from "@/data/callTypes";
import { useTechnicians } from "@/hooks/useTechnicians";
import { cn } from "@/lib/utils";
import { getSystemSettings } from "@/services/systemSettingsService";
import {
  identifyTechnicianConfig,
  type IdentifiedTechnicianConfig,
  type TechnicianCredentialMethod,
} from "@/services/technicianConfigService";
import type { SelectedTechnicianInput } from "@/services/andonService";
import type { TechnicianArea } from "@/types/andon";
import type { AttendanceMode, SystemSettings } from "@/types/systemSettings";
import { TechnicianSelector } from "./TechnicianSelector";

interface TechnicianIdentificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string | null;
  purpose: "start" | "add";
  excludeNames?: string[];
  onSuccess?: () => void;
}

function methodLabel(method: AttendanceMode) {
  if (method === "pin") return "PIN";
  if (method === "rfid") return "tag RF";
  return "nome";
}

export function TechnicianIdentificationModal({
  open,
  onOpenChange,
  callId,
  purpose,
  excludeNames = [],
  onSuccess,
}: TechnicianIdentificationModalProps) {
  const { calls, attendCall, addTechnicianSessions } = useAndon();
  const { findTechnicianByName } = useTechnicians();
  const call = callId ? (calls.find((item) => item.id === callId) ?? null) : null;
  const option = call ? getCallTypeOption(call.subtype) : null;
  const area = (option?.technicianArea ?? call?.subtype ?? null) as TechnicianArea | null;

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [method, setMethod] = useState<AttendanceMode>("name");
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [credentialValue, setCredentialValue] = useState("");
  const [notes, setNotes] = useState("");
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
    setNames([]);
    setCredentialValue("");
    setNotes("");
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
  }, [open, callId]);

  const excluded = useMemo(
    () => new Set(excludeNames.map((name) => name.toLocaleLowerCase("pt-BR"))),
    [excludeNames],
  );
  async function registerTechnicians(
    technicians: SelectedTechnicianInput[],
    submissionAlreadyStarted = false,
  ) {
    if (!call || !technicians.length || (!submissionAlreadyStarted && submittingRef.current)) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (purpose === "start") {
        await attendCall({ callId: call.id, technicians, notes: notes.trim() || null });
        toast.success("Chamado em atendimento");
      } else {
        await addTechnicianSessions({ callId: call.id, technicians });
        toast.success("Mantenedor adicionado ao atendimento");
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível registrar o atendimento",
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
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
      const technician = await identifyTechnicianConfig(
        method as TechnicianCredentialMethod,
        value,
      );
      validateTechnician(technician);
      await registerTechnicians(
        [
          {
            id: technician.id,
            name: technician.name,
            shiftId: technician.shiftId,
            shiftName: technician.shiftId,
            technicalArea: technician.area as TechnicianArea,
            credential: technician.credential,
          },
        ],
        true,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Credencial não reconhecida");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      setCredentialValue("");
    }
  }

  function validateTechnician(technician: IdentifiedTechnicianConfig) {
    if (excluded.has(technician.name.toLocaleLowerCase("pt-BR"))) {
      throw new Error(`${technician.name} já está neste atendimento`);
    }
    if (area && technician.area !== area) {
      throw new Error(`${technician.name} não pertence à área deste chamado`);
    }
  }

  function handleNameSubmit() {
    const technicians = names.map((name) => {
      const technician = findTechnicianByName(name);
      return {
        id: technician?.id,
        name,
        shiftId: technician?.shiftId,
        shiftName: technician?.shiftId,
        technicalArea: technician?.area as TechnicianArea | undefined,
      };
    });
    void registerTechnicians(technicians);
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

  if (!call) return null;

  const allowedMethods: AttendanceMode[] =
    settings?.attendanceMode === "name" ? ["name", "pin", "rfid"] : ["pin", "rfid"];
  const actionLabel = purpose === "start" ? "Iniciar atendimento" : "Adicionar mantenedor";

  return (
    <Dialog open={open} onOpenChange={(value) => !isSubmitting && onOpenChange(value)}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <DialogTitle className="text-2xl sm:text-3xl">{actionLabel}</DialogTitle>
              <DialogDescription className="mt-1 text-base">
                {method === "name"
                  ? "Selecione o nome e confirme."
                  : `Digite o ${methodLabel(method)} e pressione Enter ou ${actionLabel.toLocaleLowerCase("pt-BR")}.`}
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
                  setNames([]);
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

        {settings && method === "name" && area && (
          <TechnicianSelector
            area={area}
            value={names}
            onChange={setNames}
            excludeNames={excludeNames}
            variant="compact"
          />
        )}

        {settings && (method === "pin" || method === "rfid") && (
          <label className="block text-sm font-bold">
            {method === "pin" ? "PIN do mantenedor" : "Aproxime a tag no leitor"}
            <div className="mt-1 flex min-w-0 gap-2">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-primary">
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

        {purpose === "start" && (
          <label className="block text-sm font-bold">
            Observação inicial (opcional)
            <Textarea
              className="mt-1"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Descreva o contexto inicial do atendimento."
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
            tone={purpose === "start" ? "success" : "info"}
            size="md"
            onClick={() => (method === "name" ? handleNameSubmit() : void handleCredentialSubmit())}
            disabled={
              !settings ||
              loadFailed ||
              isSubmitting ||
              (method === "name" ? names.length === 0 : !credentialValue.trim())
            }
          >
            {isSubmitting ? "Registrando..." : actionLabel}
          </BigButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
