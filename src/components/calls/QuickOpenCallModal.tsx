import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleStop, X } from "lucide-react";
import { toast } from "@/i18n/toast";

import { BigButton } from "@/components/common/BigButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAndon } from "@/context/AndonProvider";
import { getCallTypeOption } from "@/data/callTypes";
import { getSystemSettings } from "@/services/systemSettingsService";
import type { CallCategory, CallSubtype } from "@/types/andon";
import type { MachineStatus } from "@/types/machine";
import {
  canSubmitWorkOrderGate,
  normalizeWorkOrderNumber,
  resolveWorkOrderRequirement,
} from "@/utils/workOrderUtils";

export type HierarchicalOpeningChoice = {
  reasonId: string;
  optionId: string;
  expectedReasonRevision: number;
  expectedOptionRevision: number;
  category: CallCategory;
  subtype: CallSubtype;
  label: string;
};

interface QuickOpenCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machineId: string;
  subtype: CallSubtype | null;
  forcedMachineCondition?: MachineStatus;
  hierarchicalChoice?: HierarchicalOpeningChoice | null;
}

export function QuickOpenCallModal({
  open,
  onOpenChange,
  machineId,
  subtype,
  forcedMachineCondition,
  hierarchicalChoice = null,
}: QuickOpenCallModalProps) {
  useInterfaceLanguage();
  const { machines, openCall } = useAndon();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [systemSettingsLoadFailed, setSystemSettingsLoadFailed] = useState(false);
  const [requireWorkOrderAtOpen, setRequireWorkOrderAtOpen] = useState(false);
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [operatorNote, setOperatorNote] = useState("");
  const [openingError, setOpeningError] = useState<string | null>(null);
  const option = hierarchicalChoice
    ? { category: hierarchicalChoice.category, label: hierarchicalChoice.label }
    : subtype ? getCallTypeOption(subtype) : null;
  const machineRequiresWorkOrder =
    machines.find((machine) => machine.id === machineId)?.requireWorkOrderAtOpen === true;
  const workOrderRequired = resolveWorkOrderRequirement(
    requireWorkOrderAtOpen,
    machineRequiresWorkOrder,
  );
  const canSubmit = canSubmitWorkOrderGate({
    required: workOrderRequired,
    value: workOrderNumber,
    isLoading: isLoadingSettings || !hasLoadedSettings,
    loadFailed: systemSettingsLoadFailed,
  });

  useEffect(() => {
    if (!open) {
      setOpeningError(null);
      setWorkOrderNumber("");
      setOperatorNote("");
      setRequireWorkOrderAtOpen(false);
      setHasLoadedSettings(false);
      setSystemSettingsLoadFailed(false);
      return;
    }

    let active = true;
    setIsLoadingSettings(true);
    setHasLoadedSettings(false);
    setSystemSettingsLoadFailed(false);
    void getSystemSettings()
      .then((settings) => {
        if (!active) return;
        setRequireWorkOrderAtOpen(settings.requireWorkOrderAtOpen === true);
        setHasLoadedSettings(true);
      })
      .catch(() => {
        if (!active) return;
        setHasLoadedSettings(true);
        setSystemSettingsLoadFailed(true);
        toast.error(
          "Não foi possível carregar a regra da OS. Feche e reabra o modal para tentar novamente.",
        );
      })
      .finally(() => {
        if (active) setIsLoadingSettings(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  async function handleCondition(machineCondition: MachineStatus) {
    if (!subtype || !option || isSubmitting || !canSubmit) return;

    const normalizedWorkOrderNumber = normalizeWorkOrderNumber(workOrderNumber);
    setOpeningError(null);
    setIsSubmitting(true);
    try {
      const params = {
        machineId,
        category: option.category,
        subtype,
        criticality: "medium" as const,
        machineCondition: forcedMachineCondition ?? machineCondition,
        workOrderNumber: normalizedWorkOrderNumber || undefined,
        operatorNote: operatorNote.trim() || undefined,
      };
      // A single human opening always uses POST /api/andon-calls.
      // The batch endpoint has an independent central opt-in and is only for
      // genuine multi-sector requests. Never silently retry a rejected write.
      await openCall({
        ...params,
        ...(hierarchicalChoice
          ? {
              reasonId: hierarchicalChoice.reasonId,
              optionId: hierarchicalChoice.optionId,
              expectedReasonRevision: hierarchicalChoice.expectedReasonRevision,
              expectedOptionRevision: hierarchicalChoice.expectedOptionRevision,
            }
          : {}),
      });
      toast.success(`Chamado de ${option.label} aberto.`);
      onOpenChange(false);
    } catch (error) {
      const message = ui(error instanceof Error ? error.message : "Não foi possível abrir o chamado");
      setOpeningError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const buttonDisabled = isSubmitting || !option || !canSubmit;

  return (
    <Dialog open={open} onOpenChange={(value) => !isSubmitting && onOpenChange(value)}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-2xl sm:text-3xl">
            {ui("A máquina está parada agora?")}
          </DialogTitle>
          <DialogDescription className="text-base">
            {ui("Informe a condição atual para abrir o chamado de ")}
            {option?.label ?? ui("setor")}.
          </DialogDescription>
        </DialogHeader>

        {workOrderRequired && (
          <div className="space-y-1.5">
            <Label htmlFor="quick-open-work-order">{ui("Número da OS")}</Label>
            <Input
              id="quick-open-work-order"
              value={workOrderNumber}
              maxLength={100}
              onChange={(event) => setWorkOrderNumber(event.target.value)}
              placeholder={ui("Informe o número da OS")}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="quick-open-operator-note">
            {ui("Informação para o mantenedor ")}
            <span className="font-normal text-muted-foreground">{ui("(opcional)")}</span>
          </Label>
          <Textarea
            id="quick-open-operator-note"
            value={operatorNote}
            maxLength={500}
            rows={2}
            onChange={(event) => setOperatorNote(event.target.value)}
            placeholder={ui("Ex.: ruído anormal, falha intermitente, cheiro de queimado...")}
          />
          <p className="text-right text-[11px] text-muted-foreground">{operatorNote.length}/500</p>
        </div>

        {systemSettingsLoadFailed && (
          <p className="text-sm text-danger">
            {ui(
              "Não foi possível carregar a regra da OS. Feche e reabra o modal para tentar novamente.",
            )}
          </p>
        )}

        {openingError && (
          <div role="alert" className="rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-foreground">
            {openingError}
            <p className="mt-1 text-xs text-muted-foreground">
              {ui("Os dados preenchidos foram preservados. Nenhum chamado foi confirmado.")}
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(!forcedMachineCondition || forcedMachineCondition === "stopped") && (
            <BigButton
              tone="danger"
              size="lg"
              className="min-h-24 whitespace-normal px-4 text-center"
              onClick={() => void handleCondition("stopped")}
              disabled={buttonDisabled}
            >
              <CircleStop className="h-8 w-8 shrink-0" />
              <span>{ui("Sim — está parada")}</span>
            </BigButton>
          )}
          {(!forcedMachineCondition || forcedMachineCondition === "running") && (
            <BigButton
              tone="success"
              size="lg"
              className="min-h-24 whitespace-normal px-4 text-center"
              onClick={() => void handleCondition("running")}
              disabled={buttonDisabled}
            >
              <CheckCircle2 className="h-8 w-8 shrink-0" />
              <span>{ui("Não — está operando")}</span>
            </BigButton>
          )}
        </div>

        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold hover:bg-accent"
          onClick={() => onOpenChange(false)}
          disabled={isSubmitting}
        >
          <X className="h-4 w-4" />
          {ui(" Cancelar")}
        </button>
      </DialogContent>
    </Dialog>
  );
}
