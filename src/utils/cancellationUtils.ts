export function normalizeCancellationReason(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

/**
 * Explain only known, non-sensitive cancellation error codes. A 403 can be
 * legitimate (ownership/permission/CSRF) and must NEVER trigger a retry or
 * override server authorization. HTTP status and legacy behavior are preserved.
 */
export function cancellationFailureMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Não foi possível cancelar o chamado.";
  }
  const response = error as { code?: unknown; status?: unknown; message?: unknown };
  if (response.status === 403) {
    switch (response.code) {
      case "permission_denied":
        return "Sem permissão para cancelar este chamado. Verifique se ele foi aberto por seu usuário ou solicite autorização para cancelar qualquer chamado.";
      case "scoped_query_required":
      case "machine_scope_denied":
        return "Sem acesso à máquina deste chamado. Confira o escopo de máquinas do seu usuário.";
      case "csrf_denied":
        return "Sessão de segurança inválida. Atualize a página, entre novamente e verifique o estado do chamado antes de repetir.";
      case "central_action_not_supported":
        return "O cancelamento ainda não está autorizado neste ambiente. Não altere permissões ou proteção da API para contornar o bloqueio.";
      case "workstation_inactive":
      case "workstation_denied":
        return "Workstation não autorizada. Verifique aprovação e ativação no Hub.";
    }
  }
  if (response.status === 409 && response.code === "call_state_changed") {
    return "O chamado foi alterado ou já está em atendimento. Atualize a lista antes de decidir se ainda pode cancelar.";
  }
  return typeof response.message === "string" && response.message.trim()
    ? response.message : "Não foi possível cancelar o chamado.";
}
