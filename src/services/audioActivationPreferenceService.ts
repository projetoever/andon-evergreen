import { getCurrentWorkstationId } from "./workstationIdentityService";

const AUDIO_ACTIVATION_KEY = "andon.audioActivation.v1";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Browser preference only; this does not grant autoplay permission or module access. */
export function readAudioActivationPreference(
  workstationId = getCurrentWorkstationId(),
  storage = browserStorage(),
): boolean {
  if (!workstationId || !storage) return false;
  try {
    return storage.getItem(AUDIO_ACTIVATION_KEY) === workstationId;
  } catch {
    return false;
  }
}

export function rememberAudioActivation(
  workstationId = getCurrentWorkstationId(),
  storage = browserStorage(),
): void {
  if (!workstationId || !storage) return;
  try {
    storage.setItem(AUDIO_ACTIVATION_KEY, workstationId);
  } catch {
    // This browser session can still use audio when persistent storage is unavailable.
  }
}
