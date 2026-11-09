import type { DashboardSoundState } from "./systemSettingsService";

/**
 * REFINE 11: browser/dashboard sound is an independent per-browser preference.
 * A mini-PC GPIO or external siren agent may READ the shared server state but
 * must never be a prerequisite for local speaker mute/unmute.
 */
export const DASHBOARD_BROWSER_SOUND_KEY = "andon.dashboard.browser-sound.v1";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): BrowserStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function unmuted(nowMs: number, reactivatedBy: "timeout" | null = null): DashboardSoundState {
  return {
    muted: false, mutedAt: null, mutedUntil: null, reason: null,
    updatedAt: new Date(nowMs).toISOString(), reactivatedBy,
  };
}

export function readBrowserDashboardSoundState(
  nowMs = Date.now(),
  storage: BrowserStorage | null = defaultStorage(),
): DashboardSoundState {
  let raw: string | null = null;
  try { raw = storage?.getItem(DASHBOARD_BROWSER_SOUND_KEY) ?? null; }
  catch { return unmuted(nowMs); }
  if (!raw) return unmuted(nowMs);
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const at = value.mutedAt;
    const until = value.mutedUntil;
    const reason = value.reason;
    if (value.version !== 1 || value.muted !== true ||
        typeof at !== "string" || !Number.isFinite(Date.parse(at)) ||
        (reason !== "manual" && reason !== "auto") ||
        (until !== null && (typeof until !== "string" || !Number.isFinite(Date.parse(until))))) {
      return unmuted(nowMs);
    }
    if (typeof until === "string" && Date.parse(until) <= nowMs) {
      try { storage?.removeItem(DASHBOARD_BROWSER_SOUND_KEY); } catch { /* best effort */ }
      return unmuted(nowMs, "timeout");
    }
    return {
      muted: true,
      mutedAt: at,
      mutedUntil: until as string | null,
      reason,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : at,
      reactivatedBy: null,
    };
  } catch {
    return unmuted(nowMs);
  }
}

export function updateBrowserDashboardSoundState(
  muted: boolean,
  reason: "manual" | "auto",
  timerEnabled: boolean,
  durationMinutes: number,
  nowMs = Date.now(),
  storage: BrowserStorage | null = defaultStorage(),
): DashboardSoundState {
  if (!muted) {
    try { storage?.removeItem(DASHBOARD_BROWSER_SOUND_KEY); } catch { /* in-memory state still works */ }
    return unmuted(nowMs);
  }
  const now = new Date(nowMs).toISOString();
  const duration = Number.isInteger(durationMinutes) && durationMinutes >= 1 ? durationMinutes : 3;
  const until = timerEnabled ? new Date(nowMs + duration * 60_000).toISOString() : null;
  const state: DashboardSoundState = {
    muted: true, mutedAt: now, mutedUntil: until, reason,
    updatedAt: now, reactivatedBy: null,
  };
  try {
    storage?.setItem(DASHBOARD_BROWSER_SOUND_KEY, JSON.stringify({ version: 1, ...state }));
  } catch {
    // Browsers with blocked storage still mute locally until the page closes.
  }
  return state;
}
