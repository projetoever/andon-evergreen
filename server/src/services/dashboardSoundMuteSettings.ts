export interface DashboardSoundMuteSettingsPatch {
  dashboardSoundMuteTimerEnabled?: unknown;
  dashboardSoundMuteDurationMinutes?: unknown;
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

  return null;
}
