import type { AndonStatus, CallSubtype } from "@/types/andon";
import type { MachineStatus } from "@/types/machine";

export type AlertLevel = "normal" | "warning" | "critical";

export function getMachineStatusLabel(status: MachineStatus): string {
  return status === "running" ? "Rodando" : "Parada";
}

export function getAndonStatusLabel(status: AndonStatus): string {
  switch (status) {
    case "none":
      return "Sem chamado";
    case "open":
      return "Aberto";
    case "in_progress":
      return "Em atendimento";
    case "finished":
      return "Finalizado";
  }
}

export function getCallSubtypeLabel(subtype: CallSubtype): string {
  switch (subtype) {
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
    case "finished":
      return "bg-success text-success-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function getAlertLevel(
  minutes: number,
  warning: number,
  critical: number,
): AlertLevel {
  if (minutes >= critical) return "critical";
  if (minutes >= warning) return "warning";
  return "normal";
}
