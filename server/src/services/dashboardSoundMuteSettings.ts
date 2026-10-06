export interface DashboardSoundMuteSettingsPatch {
  dashboardSoundMuteTimerEnabled?: unknown;
  dashboardSoundMuteDurationMinutes?: unknown;
  dashboardSoundAutoMuteTimerEnabled?: unknown;
  dashboardSoundActiveDurationMinutes?: unknown;
  dashboardSoundMuted?: unknown;
}

export function validateDashboardSoundMuteSettingsPatch(body: DashboardSoundMuteSettingsPatch) {
  if (
    "dashboardSoundMuteTimerEnabled" in body &&
    typeof body.dashboardSoundMuteTimerEnabled !== "boolean"
  ) {
    return "Campo dashboardSoundMuteTimerEnabled deve ser booleano";
  }

  if (
    "dashboardSoundMuteDurationMinutes" in body &&
    (!Number.isInteger(body.dashboardSoundMuteDurationMinutes) ||
      Number(body.dashboardSoundMuteDurationMinutes) < 1)
  ) {
    return "Tempo de silenciamento deve ser um número inteiro de pelo menos 1 minuto";
  }

  if (
    "dashboardSoundAutoMuteTimerEnabled" in body &&
    typeof body.dashboardSoundAutoMuteTimerEnabled !== "boolean"
  ) {
    return "Campo dashboardSoundAutoMuteTimerEnabled deve ser booleano";
  }

  if (
    "dashboardSoundActiveDurationMinutes" in body &&
    (!Number.isInteger(body.dashboardSoundActiveDurationMinutes) ||
      Number(body.dashboardSoundActiveDurationMinutes) < 1)
  ) {
    return "Tempo de som ativo deve ser um número inteiro de pelo menos 1 minuto";
  }

  if ("dashboardSoundMuted" in body && typeof body.dashboardSoundMuted !== "boolean") {
    return "Campo dashboardSoundMuted deve ser booleano";
  }

  return null;
}
