import { ui } from "@/i18n/translate";
import type { AndonStatus, CallCriticality, CallSubtype } from "@/types/andon";
import type { MachineStatus, ProductionMode } from "@/types/machine";
import { getCallTypeOption } from "@/data/callTypes";

export type AlertLevel = "normal" | "warning" | "critical";
export type DashboardCardAttentionTone = "danger" | "warning" | null;

export function getMachineStatusLabel(status: MachineStatus): string {
  return status === "running" ? ui("Pronta para rodar") : ui("Em falha");
}

export function getAndonStatusLabel(status: AndonStatus): string {
  switch (status) {
    case "none":
      return ui("Sem chamado");
    case "open":
      return ui("Aberto");
    case "in_progress":
      return ui("Em atendimento");
    case "post_maintenance":
      return ui("Acompanhamento");
    case "finished":
      return ui("Finalizado");
    case "cancelled":
      return ui("Cancelado");
  }
}

export function getCallSubtypeLabel(subtype: CallSubtype): string {
  return (
    getCallTypeOption(subtype)?.label ??
    subtype
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1))
      .join(" ")
  );
}

export function getCriticalityLabel(criticality: CallCriticality | null | undefined): string {
  switch (criticality ?? "medium") {
    case "low":
      return ui("Baixa");
    case "medium":
      return ui("Média");
    case "high":
      return ui("Alta");
  }
}

export function getCriticalityColorClass(criticality: CallCriticality | null | undefined): string {
  switch (criticality ?? "medium") {
    case "low":
      return "bg-success/15 text-success border-success/30";
    case "medium":
      return "bg-warning/15 text-warning border-warning/30";
    case "high":
      return "bg-danger/15 text-danger border-danger/30";
  }
}

export function getStatusColorClass(status: MachineStatus | AndonStatus): string {
  switch (status) {
    case "running":
      return "bg-success text-success-foreground";
    case "stopped":
      return "bg-danger text-danger-foreground";
    case "none":
      return "bg-muted text-muted-foreground";
    case "open":
      return "bg-warning text-warning-foreground";
    case "in_progress":
      return "bg-info text-info-foreground";
    case "post_maintenance":
      return "bg-info text-info-foreground";
    case "finished":
      return "bg-success text-success-foreground";
    case "cancelled":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function getAlertLevel(minutes: number, warning: number, critical: number): AlertLevel {
  if (minutes >= critical) return "critical";
  if (minutes >= warning) return "warning";
  return "normal";
}

export function getProductionModeLabel(productionMode: ProductionMode): string {
  return productionMode === "scheduled" ? ui("Produção Programada") : ui("Fora de Produção");
}

export function getMachineConditionLabel(status: MachineStatus | null | undefined): string {
  return status === "stopped" ? ui("Em falha") : ui("Pronta para rodar");
}

export function getTechnicianAreaLabel(area: string | null | undefined): string {
  switch (area) {
    case "electrical":
      return ui("Elétrica");
    case "mechanical":
      return ui("Mecânica");
    case "hot_melt":
      return ui("Hot Melt");
    case "quality":
      return ui("Qualidade");
    case "leadership":
      return ui("Liderança");
    default:
      return ui("Não informado");
  }
}

export function getDashboardCardAttentionTone(
  machineStatus: MachineStatus,
  productionMode: ProductionMode,
  andonStatus: AndonStatus,
): DashboardCardAttentionTone {
  if (machineStatus === "stopped" && productionMode !== "not_scheduled") {
    return "danger";
  }
  if (andonStatus === "open") {
    return "warning";
  }
  return null;
}
