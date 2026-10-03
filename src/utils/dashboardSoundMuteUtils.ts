import type { AndonCall } from "@/types/andon";

export const DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES = 3;

type DashboardSoundCall = Pick<AndonCall, "id" | "isSystemTest">;

export function getKnownRealCallIds(calls: DashboardSoundCall[]) {
  return new Set(calls.filter((call) => !call.isSystemTest).map((call) => call.id));
}

export function hasNewRealCall(
  mutedKnownCallIds: ReadonlySet<string>,
  calls: DashboardSoundCall[],
) {
  return calls.some((call) => !call.isSystemTest && !mutedKnownCallIds.has(call.id));
}

export function startDashboardSoundMuteTimer(
  enabled: boolean,
  durationMinutes: number,
  onExpire: () => void,
  schedule: typeof setTimeout = setTimeout,
  cancel: typeof clearTimeout = clearTimeout,
) {
  let active = true;
  if (!enabled) {
    return () => {
      active = false;
    };
  }

  const safeDurationMinutes =
    Number.isInteger(durationMinutes) && durationMinutes >= 1
      ? durationMinutes
      : DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES;
  const timeout = schedule(() => {
    if (!active) return;
    active = false;
    onExpire();
  }, safeDurationMinutes * 60_000);

  return () => {
    if (!active) return;
    active = false;
    cancel(timeout);
  };
}
