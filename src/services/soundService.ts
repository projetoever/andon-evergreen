import type { CallSubtype, SoundKey } from "@/types/andon";
import { getCallTypeOption } from "@/data/callTypes";
import { DEFAULT_SOUND_MACHINE_ID, type SoundMachineId } from "@/types/sound";
import { getSoundBlob } from "@/services/soundStorageService";
import { isMachineSoundEnabled } from "@/services/machineSoundPreferenceService";

export type AndonSoundScope = "dashboard" | "machine";

interface AndonPlaybackState {
  audioElements: Partial<Record<SoundKey, HTMLAudioElement>>;
  repeatTimers: Partial<Record<SoundKey, number>>;
  audioInstances: Set<HTMLAudioElement>;
  currentAudio: HTMLAudioElement | null;
  currentMachineId: string | null;
  playbackToken: number;
  currentEndedListener: {
    audio: HTMLAudioElement;
    listener: () => void;
  } | null;
}

const soundUrls: Record<SoundKey, string | null> = {
  electrical: null,
  mechanical: null,
  hot_melt: null,
  quality: null,
  leadership: null,
};

try {
  const modules = import.meta.glob("/src/assets/sounds/*.mp3", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>;
  for (const [path, url] of Object.entries(modules)) {
    const file = path.split("/").pop() ?? "";
    if (file === "eletrica.mp3") soundUrls.electrical = url;
    if (file === "mecanica.mp3") soundUrls.mechanical = url;
    if (file === "hot-melt.mp3") soundUrls.hot_melt = url;
    if (file === "qualidade.mp3") soundUrls.quality = url;
    if (file === "lideranca.mp3") soundUrls.leadership = url;
  }
} catch (err) {
  console.warn("[sound] could not load sound assets", err);
}

function createPlaybackState(): AndonPlaybackState {
  return {
    audioElements: {},
    repeatTimers: {},
    audioInstances: new Set<HTMLAudioElement>(),
    currentAudio: null,
    currentMachineId: null,
    playbackToken: 0,
    currentEndedListener: null,
  };
}

const playbackStates: Record<AndonSoundScope, AndonPlaybackState> = {
  dashboard: createPlaybackState(),
  machine: createPlaybackState(),
};

const customAudioUrls = new WeakMap<HTMLAudioElement, string>();

let unlocked = false;
let currentVolume = 0.8;

function ensureAudio(scope: AndonSoundScope, key: SoundKey): HTMLAudioElement | null {
  const url = soundUrls[key];
  if (!url) return null;

  const state = playbackStates[scope];
  if (!state.audioElements[key]) {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = currentVolume;
    state.audioElements[key] = audio;
  }

  return state.audioElements[key] ?? null;
}

function stopTimer(scope: AndonSoundScope, key: SoundKey): void {
  const state = playbackStates[scope];
  const id = state.repeatTimers[key];
  if (id) {
    window.clearTimeout(id);
    delete state.repeatTimers[key];
  }
}

function stopAllAndonRepeatTimers(scope: AndonSoundScope): void {
  for (const key of Object.keys(soundUrls) as SoundKey[]) {
    stopTimer(scope, key);
  }
}

function stopAudioElement(audio: HTMLAudioElement): void {
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // ignore
  }
}

function releaseCustomAudio(audio: HTMLAudioElement, state?: AndonPlaybackState): void {
  const url = customAudioUrls.get(audio);
  if (url) {
    URL.revokeObjectURL(url);
    customAudioUrls.delete(audio);
  }
  state?.audioInstances.delete(audio);
}

function detachCurrentEndedListener(scope: AndonSoundScope): void {
  const state = playbackStates[scope];
  if (!state.currentEndedListener) return;
  state.currentEndedListener.audio.removeEventListener(
    "ended",
    state.currentEndedListener.listener,
  );
  state.currentEndedListener = null;
}

async function playAudio(audio: HTMLAudioElement): Promise<void> {
  audio.currentTime = 0;
  audio.volume = currentVolume;
  await audio.play();
}

function stopCurrentAndonAudio(scope: AndonSoundScope): void {
  const state = playbackStates[scope];

  detachCurrentEndedListener(scope);

  if (state.currentAudio) {
    stopAudioElement(state.currentAudio);
  }

  for (const audio of state.audioInstances) {
    stopAudioElement(audio);
    releaseCustomAudio(audio, state);
  }

  state.audioInstances.clear();
  state.currentAudio = null;
  state.currentMachineId = null;
  state.playbackToken += 1;
}

async function createCustomAudio(
  machineId: SoundMachineId,
  subtype: CallSubtype,
): Promise<HTMLAudioElement | null> {
  const machineBlob = await getSoundBlob(machineId, subtype);
  const fallbackBlob =
    machineId === DEFAULT_SOUND_MACHINE_ID
      ? null
      : await getSoundBlob(DEFAULT_SOUND_MACHINE_ID, subtype);
  const blob = machineBlob ?? fallbackBlob;
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.volume = currentVolume;
  customAudioUrls.set(audio, url);
  return audio;
}

export function unlockAudio(): void {
  unlocked = true;

  for (const scope of Object.keys(playbackStates) as AndonSoundScope[]) {
    for (const key of Object.keys(soundUrls) as SoundKey[]) {
      const audio = ensureAudio(scope, key);
      if (!audio) continue;
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => {});
    }
  }
}

export function setSoundVolume(volume: number): void {
  currentVolume = Math.max(0, Math.min(1, volume));

  for (const state of Object.values(playbackStates)) {
    for (const audio of Object.values(state.audioElements)) {
      if (audio) audio.volume = currentVolume;
    }
    for (const audio of state.audioInstances) {
      audio.volume = currentVolume;
    }
  }
}

export function stopCallSound(key: SoundKey, scope?: AndonSoundScope): void {
  const scopes = scope ? [scope] : (Object.keys(playbackStates) as AndonSoundScope[]);

  for (const currentScope of scopes) {
    const state = playbackStates[currentScope];
    stopTimer(currentScope, key);
    const audio = state.audioElements[key];
    if (!audio) continue;

    if (state.currentAudio === audio) {
      stopCurrentAndonAudio(currentScope);
      continue;
    }

    stopAudioElement(audio);
  }
}

export function stopAllSounds(): void {
  for (const scope of Object.keys(playbackStates) as AndonSoundScope[]) {
    stopAllAndonRepeatTimers(scope);
    stopCurrentAndonAudio(scope);
  }
}

export function stopAndonSound(
  machineId?: string,
  scope: AndonSoundScope = "dashboard",
): void {
  const state = playbackStates[scope];
  if (!machineId || state.currentMachineId === machineId) {
    stopAllAndonRepeatTimers(scope);
    stopCurrentAndonAudio(scope);
  }
}

export async function playAndonSound(
  machineId: string,
  subtype: CallSubtype,
  repeatIntervalSeconds = 10,
  scope: AndonSoundScope = "dashboard",
  respectMachinePreference = scope === "machine",
): Promise<void> {
  if (!unlocked) return;
  if (respectMachinePreference && !isMachineSoundEnabled(machineId)) return;

  const callType = getCallTypeOption(subtype);
  if (!callType) return;

  const state = playbackStates[scope];
  stopAllAndonRepeatTimers(scope);
  stopCurrentAndonAudio(scope);

  const playbackToken = state.playbackToken + 1;
  state.playbackToken = playbackToken;

  const key = callType.soundKey;
  let audio = await createCustomAudio(machineId, subtype);

  if (playbackToken !== state.playbackToken) {
    if (audio) {
      stopAudioElement(audio);
      releaseCustomAudio(audio, state);
    }
    return;
  }

  if (!audio) {
    audio = ensureAudio(scope, key);
  }

  if (!audio) return;

  try {
    state.currentAudio = audio;
    state.currentMachineId = machineId;
    state.audioInstances.add(audio);
    await playAudio(audio);
  } catch (err) {
    releaseCustomAudio(audio, state);
    if (playbackToken === state.playbackToken) {
      console.warn("[sound] play failed", err);
    }
    return;
  }

  if (playbackToken !== state.playbackToken) {
    stopAudioElement(audio);
    releaseCustomAudio(audio, state);
    return;
  }

  const endedListener = () => {
    if (playbackToken !== state.playbackToken) return;

    if (repeatIntervalSeconds <= 0) {
      releaseCustomAudio(audio, state);
      return;
    }

    stopTimer(scope, key);
    state.repeatTimers[key] = window.setTimeout(() => {
      delete state.repeatTimers[key];
      if (playbackToken !== state.playbackToken) return;
      void playAudio(audio).catch((error) => {
        if (playbackToken === state.playbackToken) {
          console.warn("[sound] repeat failed", error);
        }
      });
    }, repeatIntervalSeconds * 1000);
  };

  audio.addEventListener("ended", endedListener);
  state.currentEndedListener = { audio, listener: endedListener };
}

export async function testAndonSound(
  machineId: SoundMachineId,
  subtype: CallSubtype,
): Promise<boolean> {
  if (!unlocked) return false;

  const customAudio = await createCustomAudio(machineId, subtype);
  if (customAudio) {
    customAudio.addEventListener("ended", () => releaseCustomAudio(customAudio), { once: true });
    try {
      await playAudio(customAudio);
    } catch (error) {
      releaseCustomAudio(customAudio);
      throw error;
    }
    return true;
  }

  const callType = getCallTypeOption(subtype);
  if (!callType) return false;
  const fallbackAudio = ensureAudio("dashboard", callType.soundKey);
  if (!fallbackAudio) return false;
  await playAudio(fallbackAudio);
  return true;
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}
