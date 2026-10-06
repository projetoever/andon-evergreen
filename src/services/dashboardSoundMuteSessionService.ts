export type DashboardSoundMuteReason = "manual" | "auto";

export interface DashboardSoundMuteSessionState {
  reason: DashboardSoundMuteReason;
  knownCallIds: string[];
  mutedAtMs: number;
  mutedUntilMs: number | null;
}

const STORAGE_KEY = "andon.dashboardSoundMuteState.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getDefaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isDashboardSoundMuteReason(value: unknown): value is DashboardSoundMuteReason {
  return value === "manual" || value === "auto";
}

function parseDashboardSoundMuteSessionState(
  raw: string,
): DashboardSoundMuteSessionState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DashboardSoundMuteSessionState>;
    if (!isDashboardSoundMuteReason(parsed.reason)) return null;
    if (!Array.isArray(parsed.knownCallIds)) return null;
    if (!parsed.knownCallIds.every((id) => typeof id === "string")) return null;
    if (!isFiniteTimestamp(parsed.mutedAtMs)) return null;
    if (
      parsed.mutedUntilMs !== null &&
      !isFiniteTimestamp(parsed.mutedUntilMs)
    ) {
      return null;
    }

    return {
      reason: parsed.reason,
      knownCallIds: parsed.knownCallIds,
      mutedAtMs: parsed.mutedAtMs,
      mutedUntilMs: parsed.mutedUntilMs ?? null,
    };
  } catch {
    return null;
  }
}

export function createDashboardSoundMuteSessionState({
  reason,
  knownCallIds,
  timerEnabled,
  durationMinutes,
  nowMs = Date.now(),
}: {
  reason: DashboardSoundMuteReason;
  knownCallIds: Iterable<string>;
  timerEnabled: boolean;
  durationMinutes: number;
  nowMs?: number;
}): DashboardSoundMuteSessionState {
  const safeDurationMinutes =
    Number.isInteger(durationMinutes) && durationMinutes >= 1
      ? durationMinutes
      : 3;

  return {
    reason,
    knownCallIds: Array.from(new Set(knownCallIds)),
    mutedAtMs: nowMs,
    mutedUntilMs: timerEnabled ? nowMs + safeDurationMinutes * 60_000 : null,
  };
}

export function isDashboardSoundMuteSessionExpired(
  state: DashboardSoundMuteSessionState,
  nowMs = Date.now(),
) {
  return state.mutedUntilMs !== null && state.mutedUntilMs <= nowMs;
}

export function getDashboardSoundMuteRemainingMs(
  state: DashboardSoundMuteSessionState,
  nowMs = Date.now(),
) {
  if (state.mutedUntilMs === null) return null;
  return Math.max(0, state.mutedUntilMs - nowMs);
}

export function startDashboardSoundMuteSessionTimer(
  state: DashboardSoundMuteSessionState,
  onExpire: () => void,
  schedule: typeof setTimeout = setTimeout,
  cancel: typeof clearTimeout = clearTimeout,
  nowMs = Date.now(),
) {
  const remainingMs = getDashboardSoundMuteRemainingMs(state, nowMs);
  let active = true;

  if (remainingMs === null) {
    return () => {
      active = false;
    };
  }

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

export function loadDashboardSoundMuteSession(
  storage: StorageLike | null = getDefaultStorage(),
  nowMs = Date.now(),
): DashboardSoundMuteSessionState | null {
  if (!storage) return null;

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;

  const state = parseDashboardSoundMuteSessionState(raw);
  if (!state || isDashboardSoundMuteSessionExpired(state, nowMs)) {
    storage.removeItem(STORAGE_KEY);
    return null;
  }

  return state;
}

export function saveDashboardSoundMuteSession(
  state: DashboardSoundMuteSessionState,
  storage: StorageLike | null = getDefaultStorage(),
) {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearDashboardSoundMuteSession(
  storage: StorageLike | null = getDefaultStorage(),
) {
  storage?.removeItem(STORAGE_KEY);
}
