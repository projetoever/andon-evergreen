import { getCallTypeOption } from "@/data/callTypes";
import type { AndonCall } from "@/types/andon";
import type { Machine } from "@/types/machine";
import type { SoundConfig } from "@/types/settings";

export const DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES = 3;
export const DEFAULT_DASHBOARD_SOUND_ACTIVE_DURATION_MINUTES = 3;

type DashboardSoundCall = Pick<AndonCall, "id" | "status" | "isSystemTest">;

export function getKnownRealCallIds(calls: DashboardSoundCall[]) {
  return new Set(calls.filter((call) => !call.isSystemTest).map((call) => call.id));
}

export function hasNewRealCall(
  mutedKnownCallIds: ReadonlySet<string>,
  calls: DashboardSoundCall[],
) {
  return calls.some((call) => !call.isSystemTest && !mutedKnownCallIds.has(call.id));
}


type DashboardTimedCall = Pick<AndonCall, "openedAt" | "isSystemTest">;

export function hasRealCallOpenedAfter(
  calls: readonly DashboardTimedCall[],
  mutedAt: string | null | undefined,
) {
  if (!mutedAt) return false;
  const mutedAtMs = new Date(mutedAt).getTime();
  if (Number.isNaN(mutedAtMs)) return false;

  return calls.some((call) => {
    if (call.isSystemTest) return false;
    const openedAtMs = new Date(call.openedAt).getTime();
    return !Number.isNaN(openedAtMs) && openedAtMs > mutedAtMs;
  });
}

export function startDashboardSoundMuteDeadlineTimer(
  mutedUntil: string | null | undefined,
  onExpire: () => void,
  schedule: typeof setTimeout = setTimeout,
  cancel: typeof clearTimeout = clearTimeout,
  nowMs = Date.now(),
) {
  let active = true;
  if (!mutedUntil) {
    return () => {
      active = false;
    };
  }

  const mutedUntilMs = new Date(mutedUntil).getTime();
  if (Number.isNaN(mutedUntilMs)) {
    return () => {
      active = false;
    };
  }

  const remainingMs = mutedUntilMs - nowMs;
  if (remainingMs <= 0) {
    onExpire();
    active = false;
    return () => {};
  }

  const timeout = schedule(() => {
    if (!active) return;
    active = false;
    onExpire();
  }, remainingMs);

  return () => {
    if (!active) return;
    active = false;
    cancel(timeout);
  };
}


type DashboardAlertCall = Pick<
  AndonCall,
  "machineId" | "status" | "subtype" | "isSystemTest"
>;
type DashboardAlertMachine = Pick<Machine, "id" | "isActive">;

export function hasDashboardAlertingCall(
  calls: readonly DashboardAlertCall[],
  machines: readonly DashboardAlertMachine[],
  soundConfigs: readonly SoundConfig[],
) {
  const activeMachineIds = new Set(
    machines.filter((machine) => machine.isActive).map((machine) => machine.id),
  );

  return calls.some((call) => {
    if (call.isSystemTest || call.status !== "open") return false;
    if (!activeMachineIds.has(call.machineId)) return false;
    if (!getCallTypeOption(call.subtype)) return false;

    const config = soundConfigs.find((item) => item.key === call.subtype);
    return config?.enabled === true;
  });
}

function startDashboardSoundPhaseTimer(
  enabled: boolean,
  durationMinutes: number,
  defaultDurationMinutes: number,
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
      : defaultDurationMinutes;
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

export function startDashboardSoundMuteTimer(
  enabled: boolean,
  durationMinutes: number,
  onExpire: () => void,
  schedule: typeof setTimeout = setTimeout,
  cancel: typeof clearTimeout = clearTimeout,
) {
  return startDashboardSoundPhaseTimer(
    enabled,
    durationMinutes,
    DEFAULT_DASHBOARD_SOUND_MUTE_DURATION_MINUTES,
    onExpire,
    schedule,
    cancel,
  );
}

export function startDashboardSoundActiveTimer(
  enabled: boolean,
  durationMinutes: number,
  onExpire: () => void,
  schedule: typeof setTimeout = setTimeout,
  cancel: typeof clearTimeout = clearTimeout,
) {
  return startDashboardSoundPhaseTimer(
    enabled,
    durationMinutes,
    DEFAULT_DASHBOARD_SOUND_ACTIVE_DURATION_MINUTES,
    onExpire,
    schedule,
    cancel,
  );
}
