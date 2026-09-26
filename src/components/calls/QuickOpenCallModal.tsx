import { useEffect, useState } from "react";
import { CheckCircle2, CircleStop, X } from "lucide-react";
import { toast } from "sonner";

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
import { useAndon } from "@/context/AndonProvider";
import { getCallTypeOption } from "@/data/callTypes";
import { getSystemSettings } from "@/services/systemSettingsService";
import type { CallSubtype } from "@/types/andon";
import type { MachineStatus } from "@/types/machine";
import { canSubmitWorkOrderGate, normalizeWorkOrderNumber } from "@/utils/workOrderUtils";

interface QuickOpenCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machineId: string;
  subtype: CallSubtype | null;
  forcedMachineCondition?: MachineStatus;
}

export function QuickOpenCallModal({
  open,
  onOpenChange,
  machineId,
  subtype,
  forcedMachineCondition,
}: QuickOpenCallModalProps) {
  const { openCalls } = useAndon();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [systemSettingsLoadFailed, setSystemSettingsLoadFailed] = useState(false);
  const [requireWorkOrderAtOpen, setRequireWorkOrderAtOpen] = useState(false);
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const option = subtype ? getCallTypeOption(subtype) : null;
  const canSubmit = canSubmitWorkOrderGate({
    required: requireWorkOrderAtOpen,
    value: workOrderNumber,
    isLoading: isLoadingSettings || !hasLoadedSettings,
    loadFailed: systemSettingsLoadFailed,
  });

  useEffect(() => {
    if (!open) {
      setWorkOrderNumber("");
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
    setIsSubmitting(true);
    try {
      await openCalls([
        {
          machineId,
          category: option.category,
          subtype,
          criticality: "medium",
          machineCondition: forcedMachineCondition ?? machineCondition,
          workOrderNumber: normalizedWorkOrderNumber || undefined,
        },
      ]);
      toast.success(`Chamado de ${option.label} aberto.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o chamado");
    } finally {
      setIsSubmitting(false);
    }
  }

  const buttonDisabled = isSubmitting || !option || !canSubmit;

  return (
    <Dialog open={open} onOpenChange={(value) => !isSubmitting && onOpenChange(value)}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-2xl sm:text-3xl">A máquina está parada agora?</DialogTitle>
          <DialogDescription className="text-base">
            Informe a condição atual para abrir o chamado de {option?.label ?? "setor"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="quick-open-work-order">Número da OS</Label>
          <Input
            id="quick-open-work-order"
            value={workOrderNumber}
            maxLength={100}
            onChange={(event) => setWorkOrderNumber(event.target.value)}
            placeholder="Informe o número da OS"
          />
        </div>

        {systemSettingsLoadFailed && (
          <p className="text-sm text-danger">
            Não foi possível carregar a regra da OS. Feche e reabra o modal para tentar novamente.
          </p>
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
              <span>Sim — está parada</span>
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
              <span>Não — está operando</span>
            </BigButton>
          )}
        </div>

        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold hover:bg-accent"
          onClick={() => onOpenChange(false)}
          disabled={isSubmitting}
        >
          <X className="h-4 w-4" /> Cancelar
        </button>
      </DialogContent>
    </Dialog>
  );
}
