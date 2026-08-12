import { useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp, CreditCard, Hash, UserCheck, X } from "lucide-react";
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

const SUPPORT_AREAS: TechnicianArea[] = ["electrical", "mechanical", "hot_melt"];

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
  const call = callId ? calls.find((item) => item.id === callId) ?? null : null;
  const option = call ? getCallTypeOption(call.subtype) : null;
  const area = option?.technicianArea ?? null;
  const optionalAreas = purpose === "add" && area
    ? SUPPORT_AREAS.filter((candidate) => candidate !== area)
    : [];

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [method, setMethod] = useState<AttendanceMode>("name");
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [identified, setIdentified] = useState<IdentifiedTechnicianConfig[]>([]);
  const [credentialValue, setCredentialValue] = useState("");
  const [notes, setNotes] = useState("");
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initializedCallRef = useRef<string | null>(null);

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
    setIdentified([]);
    setCredentialValue("");
    setNotes("");
    setShowAlternatives(false);
    setIsSubmitting(false);

    getSystemSettings()
      .then((value) => {
        setSettings(value);
        setMethod(value.attendanceMode);
      })
      .catch((error) => {
        setLoadFailed(true);
        toast.error(
          error instanceof Error ? error.message : "Não foi possível carregar o modo de atendimento",
        );
      });
  }, [open, callId]);

  const excluded = useMemo(
    () => new Set(excludeNames.map((name) => name.toLocaleLowerCase("pt-BR"))),
    [excludeNames],
  );

  async function handleIdentify() {
    if (method !== "pin" && method !== "rfid") return;
    const value = credentialValue.trim();
    if (!value) return;

    setIsIdentifying(true);
    try {
      const technician = await identifyTechnicianConfig(
        method as TechnicianCredentialMethod,
        value,
      );
      if (excluded.has(technician.name.toLocaleLowerCase("pt-BR"))) {
        throw new Error(`${technician.name} já está neste atendimento`);
      }
      if (purpose === "start" && area && technician.area !== area) {
        throw new Error(`${technician.name} não pertence à área deste chamado`);
      }
      if (purpose === "add" && !SUPPORT_AREAS.includes(technician.area as TechnicianArea)) {
        throw new Error(`${technician.name} não pertence a uma área de manutenção`);
      }

      setIdentified((current) =>
        current.some((item) => item.id === technician.id) ? current : [...current, technician],
      );
      setCredentialValue("");
      toast.success(`${technician.name} identificado.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Credencial não reconhecida");
      setCredentialValue("");
    } finally {
      setIsIdentifying(false);
    }
  }

  useEffect(() => {
    if (
      method === "rfid" &&
      settings?.rfidInputTerminator === "fixed_length" &&
      settings.rfidCodeLength &&
      credentialValue.length === settings.rfidCodeLength &&
      !isIdentifying
    ) {
      void handleIdentify();
    }
  }, [credentialValue, isIdentifying, method, settings?.rfidCodeLength, settings?.rfidInputTerminator]);

  function resolveTechnicians() {
    if (method === "name") {
      return names.map((name) => {
        const technician = findTechnicianByName(name);
        return {
          id: technician?.id,
          name,
          shiftId: technician?.shiftId,
          shiftName: technician?.shiftId,
          technicalArea: technician?.area as TechnicianArea | undefined,
        };
      });
    }

    return identified.map((technician) => ({
      id: technician.id,
      name: technician.name,
      shiftId: technician.shiftId,
      shiftName: technician.shiftId,
      technicalArea: technician.area as TechnicianArea,
      credential: technician.credential,
    }));
  }

  async function handleSubmit() {
    if (!call) return;
    const technicians = resolveTechnicians();
    if (!technicians.length) {
      toast.error(`Identifique pelo menos um mantenedor por ${methodLabel(method)}.`);
      return;
    }

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
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar o atendimento");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!call) return null;

  const selectedCount = method === "name" ? names.length : identified.length;
  const allowedMethods: AttendanceMode[] = settings?.attendanceMode === "name"
    ? ["name", "pin", "rfid"]
    : ["pin", "rfid"];

  return (
    <Dialog open={open} onOpenChange={(value) => !isSubmitting && onOpenChange(value)}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <DialogTitle className="text-2xl sm:text-3xl">
                {purpose === "start" ? "Iniciar atendimento" : "Adicionar mantenedor"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-base">
                Identificação por {methodLabel(method)} · {option?.label ?? call.subtype}
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
          <div className="rounded-xl border border-info/30 bg-info/10 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-info">
              Forma alternativa de identificação
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {allowedMethods.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => {
                    setMethod(candidate);
                    setNames([]);
                    setIdentified([]);
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
                  {candidate === "name" ? "Lista de nomes" : candidate === "pin" ? "Usar PIN" : "Usar tag"}
                </button>
              ))}
            </div>
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
            optionalAreas={optionalAreas}
          />
        )}

        {settings && (method === "pin" || method === "rfid") && (
          <div className="space-y-3">
            <label className="block text-sm font-bold">
              {method === "pin" ? "PIN do mantenedor" : "Aproxime a tag no leitor"}
              <div className="mt-1 flex min-w-0 gap-2">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-primary">
                  {method === "pin" ? <Hash className="h-6 w-6" /> : <CreditCard className="h-6 w-6" />}
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
                      void handleIdentify();
                    }
                  }}
                  maxLength={method === "pin" ? 8 : 64}
                  placeholder={method === "pin" ? "4 a 8 números" : "Aguardando leitura..."}
                />
                <BigButton
                  tone="info"
                  size="md"
                  className="shrink-0"
                  onClick={() => void handleIdentify()}
                  disabled={!credentialValue.trim() || isIdentifying}
                >
                  {isIdentifying ? "Validando..." : "Identificar"}
                </BigButton>
              </div>
            </label>

            {identified.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Mantenedores identificados
                </p>
                {identified.map((technician) => (
                  <div
                    key={technician.id}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-success/40 bg-success/10 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <UserCheck className="h-5 w-5 shrink-0 text-success" />
                      <span className="truncate font-black">{technician.name}</span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remover ${technician.name}`}
                      onClick={() =>
                        setIdentified((current) => current.filter((item) => item.id !== technician.id))
                      }
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-danger/10 hover:text-danger"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
          <BigButton tone="neutral" size="md" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </BigButton>
          <BigButton
            tone={purpose === "start" ? "success" : "info"}
            size="md"
            onClick={() => void handleSubmit()}
            disabled={!settings || loadFailed || selectedCount === 0 || isSubmitting}
          >
            {isSubmitting
              ? "Registrando..."
              : purpose === "start"
                ? "Iniciar atendimento"
                : "Adicionar ao atendimento"}
          </BigButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
