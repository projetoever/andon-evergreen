export function buildAndonApiErrorMessage(
  status: number,
  payload: unknown,
) {
  // Prefer server-owned stable codes over optional human messages. A generic
  // workstation message must never hide the reason for a P0 403 denial.
  const code = payload && typeof payload === "object" && "error" in payload
    ? (payload as { error?: unknown }).error
    : null;
  const knownErrors: Record<string, string> = {
    central_action_not_supported: "Esta operação está desabilitada para o acesso central no servidor. Solicite a liberação controlada ao administrador.",
    workstation_inactive: "Esta workstation está desativada ou aguardando aprovação. Solicite autorização antes de abrir chamados.",
    workstation_identification_required: "Não foi possível identificar esta workstation. Reabra o Hub e conclua a identificação.",
    workstation_session_mismatch: "A sessão não corresponde à workstation atual. Faça login novamente neste dispositivo.",
    authentication_required: "Sua sessão não está válida. Identifique-se novamente no Hub.",
    csrf_denied: "A verificação de segurança da sessão falhou. Faça login novamente e tente uma nova abertura.",
    permission_denied: "Seu usuário não tem permissão para executar esta operação.",
    machine_scope_denied: "Seu usuário não tem permissão para abrir chamados nesta máquina.",
    origin_denied: "A origem HTTPS do navegador não corresponde à origem autorizada do servidor.",
    https_required: "O acesso seguro HTTPS é obrigatório para esta operação.",
    hierarchical_calls_disabled: "A abertura com motivo e especialidade não está habilitada no servidor.",
    reserved_call_origin: "O servidor recusou metadados de origem do chamado. Atualize a interface e tente novamente.",
    rate_limited: "Muitas solicitações seguidas. Aguarde e tente novamente.",
  };
  if (typeof code === "string" && Object.prototype.hasOwnProperty.call(knownErrors, code)) {
    return `${knownErrors[code]} (HTTP ${status} · ${code})`;
  }
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload
  ) {
    const message = (
      payload as { message?: unknown }
    ).message;

    if (
      typeof message === "string" &&
      message.trim()
    ) {
      return message;
    }
  }

  return `Falha ao comunicar com a API ANDON (HTTP ${status}${typeof code === "string" && /^[a-z_]{1,64}$/.test(code) ? ` · ${code}` : ""}).`;
}
