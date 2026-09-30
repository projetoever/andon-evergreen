import type { AndonCall } from "@/types/andon";

export const DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES = 3;

type DashboardSoundCall = Pick<AndonCall, "id" | "status" | "isSystemTest">;

export function getOpenRealCallIds(calls: DashboardSoundCall[]) {
  return new Set(
    calls.filter((call) => call.status === "open" && !call.isSystemTest).map((call) => call.id),
  );
}

export function hasNewOpenRealCall(mutedCallIds: ReadonlySet<string>, calls: DashboardSoundCall[]) {
  return [...getOpenRealCallIds(calls)].some((callId) => !mutedCallIds.has(callId));
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
