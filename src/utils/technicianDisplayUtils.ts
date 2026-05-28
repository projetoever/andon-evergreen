export function formatShiftName(shiftName?: string | null): string {
  if (!shiftName) return "Não informado";
  const normalized = shiftName.toLowerCase();
  const labels: Record<string, string> = {
    morning: "Manhã",
    afternoon: "Tarde",
    night: "Noite",
    business: "Comercial",
  };
  return labels[normalized] ?? shiftName;
}

export function formatTechnicianDisplayName(name?: string | null): string {
  const normalizedName = name?.trim();
  if (!normalizedName) return "Sem manutentor apontado";
  return normalizedName;
}

export function formatSessionEndReason(reason?: string | null): string {
  if (!reason) return "Não informado";
  const labels: Record<string, string> = {
    handover: "Troca de turno",
    support_finished: "Apoio encerrado",
    support_completed: "Apoio encerrado",
    transferred: "Serviço transferido",
    service_transferred: "Serviço transferido",
    break: "Intervalo",
    final_call: "Finalização da ocorrência",
    manual: "Manual",
    other: "Outro",
  };
  return labels[reason] ?? reason;
}

export function formatTimeAllocationSource(source?: string | null): string {
  if (!source) return "Não informado";
  const labels: Record<string, string> = {
    registered_session: "Sessão registrada",
    full_period_final_selection: "Período completo selecionado na finalização",
    single_responsible_full_period: "Responsável único pelo atendimento",
    unassigned_time: "Tempo sem manutentor apontado",
  };
  return labels[source] ?? source;
}
