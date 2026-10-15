import { ui } from "@/i18n/translate";
export function formatShiftName(shiftName?: string | null): string {
  if (!shiftName) return ui("Não informado");
  const normalized = shiftName.toLowerCase();
  const labels: Record<string, string> = {
    morning: ui("Manhã"),
    afternoon: ui("Tarde"),
    night: ui("Noite"),
    business: ui("Comercial"),
  };
  return labels[normalized] ?? shiftName;
}

export function formatTechnicianDisplayName(name?: string | null): string {
  const normalizedName = name?.trim();
  if (!normalizedName) return ui("Sem mantenedor apontado");
  return normalizedName;
}

export function formatSessionEndReason(reason?: string | null): string {
  if (!reason) return ui("Não informado");
  const labels: Record<string, string> = {
    handover: ui("Troca de turno"),
    support_finished: ui("Apoio encerrado"),
    support_completed: ui("Apoio encerrado"),
    maintenance_completed: ui("Manutenção concluída"),
    follow_up_finished: ui("Acompanhamento encerrado"),
    returned_to_maintenance: ui("Retorno à manutenção"),
    transferred: ui("Serviço transferido"),
    service_transferred: ui("Serviço transferido"),
    break: ui("Intervalo"),
    final_call: ui("Finalização da ocorrência"),
    manual: ui("Manual"),
    other: ui("Outro"),
  };
  return labels[reason] ?? reason;
}

export function formatTimeAllocationSource(source?: string | null): string {
  if (!source) return ui("Não informado");
  const labels: Record<string, string> = {
    registered_session: ui("Sessão registrada"),
    full_period_final_selection: ui("Período completo selecionado na finalização"),
    single_responsible_full_period: ui("Responsável único pelo atendimento"),
    unassigned_time: ui("Tempo sem mantenedor apontado"),
  };
  return labels[source] ?? source;
}
