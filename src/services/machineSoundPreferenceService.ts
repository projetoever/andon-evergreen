const MACHINE_SOUND_PREFERENCES_KEY = "andon.machineSoundPreferences";

type MachineSoundPreferences = Record<string, boolean>;

export function getMachineSoundPreferences(): MachineSoundPreferences {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MACHINE_SOUND_PREFERENCES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MachineSoundPreferences;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function isMachineSoundEnabled(machineId: string): boolean {
  const prefs = getMachineSoundPreferences();
  return prefs[machineId] ?? true;
}

export function setMachineSoundEnabled(machineId: string, enabled: boolean): void {
  if (typeof window === "undefined") return;
  const prefs = getMachineSoundPreferences();
  prefs[machineId] = enabled;
  window.localStorage.setItem(MACHINE_SOUND_PREFERENCES_KEY, JSON.stringify(prefs));
}
