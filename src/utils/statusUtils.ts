import type { AndonStatus, CallCriticality, CallSubtype } from "@/types/andon";
import type { MachineStatus, ProductionMode } from "@/types/machine";
import { getCallTypeOption } from "@/data/callTypes";

export type AlertLevel = "normal" | "warning" | "critical";

export function getMachineStatusLabel(status: MachineStatus): string {
  return status === "running" ? "Pronta para rodar" : "Em falha";
}

export function getAndonStatusLabel(status: AndonStatus): string {
  switch (status) {
    case "none":
      return "Sem chamado";
    case "open":
      return "Aberto";
    case "in_progress":
      return "Em atendimento";
    case "post_maintenance":
      return "Acompanhamento";
    case "finished":
      return "Finalizado";
    case "cancelled":
      return "Cancelado";
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
      return "Baixa";
    case "medium":
      return "Média";
    case "high":
      return "Alta";
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
  return productionMode === "scheduled" ? "Produção Programada" : "Fora de Produção";
}

export function getMachineConditionLabel(status: MachineStatus | null | undefined): string {
  return status === "stopped" ? "Em falha" : "Pronta para rodar";
}

export function getTechnicianAreaLabel(area: string | null | undefined): string {
  switch (area) {
    case "electrical":
      return "Elétrica";
    case "mechanical":
      return "Mecânica";
    case "hot_melt":
      return "Hot Melt";
    case "quality":
      return "Qualidade";
    case "leadership":
      return "Liderança";
    default:
      return "Não informado";
  }
}
