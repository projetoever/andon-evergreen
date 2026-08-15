import type { CallSubtype, SoundKey } from "@/types/andon";
import { getCallTypeOption } from "@/data/callTypes";
import { DEFAULT_SOUND_MACHINE_ID, type SoundMachineId } from "@/types/sound";
import { getSoundBlob } from "@/services/soundStorageService";
import { isMachineSoundEnabled } from "@/services/machineSoundPreferenceService";

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

const audioElements: Partial<Record<SoundKey, HTMLAudioElement>> = {};
const repeatTimers: Partial<Record<SoundKey, number>> = {};
const andonAudioInstances = new Set<HTMLAudioElement>();
const customAudioUrls = new WeakMap<HTMLAudioElement, string>();

let unlocked = false;
let currentVolume = 0.8;
let currentAndonAudio: HTMLAudioElement | null = null;
let currentAndonMachineId: string | null = null;
let currentPlaybackToken = 0;
let currentEndedListener: {
  audio: HTMLAudioElement;
  listener: () => void;
} | null = null;

function ensureAudio(key: SoundKey): HTMLAudioElement | null {
  const url = soundUrls[key];
  if (!url) return null;
  if (!audioElements[key]) {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = currentVolume;
    audioElements[key] = audio;
  }
  return audioElements[key] ?? null;
}

function stopTimer(key: SoundKey): void {
  const id = repeatTimers[key];
  if (id) {
    window.clearTimeout(id);
    delete repeatTimers[key];
  }
}

function stopAllAndonRepeatTimers(): void {
  for (const key of Object.keys(soundUrls) as SoundKey[]) {
    stopTimer(key);
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

function releaseCustomAudio(audio: HTMLAudioElement): void {
  const url = customAudioUrls.get(audio);
  if (url) {
    URL.revokeObjectURL(url);
    customAudioUrls.delete(audio);
  }
  andonAudioInstances.delete(audio);
}

function detachCurrentEndedListener(): void {
  if (!currentEndedListener) return;
  currentEndedListener.audio.removeEventListener("ended", currentEndedListener.listener);
  currentEndedListener = null;
}

async function playAudio(audio: HTMLAudioElement): Promise<void> {
  audio.currentTime = 0;
  audio.volume = currentVolume;
  await audio.play();
}

function stopCurrentAndonAudio(): void {
  detachCurrentEndedListener();

  if (currentAndonAudio) {
    stopAudioElement(currentAndonAudio);
  }

  for (const audio of andonAudioInstances) {
    stopAudioElement(audio);
    releaseCustomAudio(audio);
  }

  andonAudioInstances.clear();
  currentAndonAudio = null;
  currentAndonMachineId = null;
  currentPlaybackToken += 1;
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
  for (const key of Object.keys(soundUrls) as SoundKey[]) {
    const audio = ensureAudio(key);
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

export function setSoundVolume(volume: number): void {
  currentVolume = Math.max(0, Math.min(1, volume));
  for (const audio of Object.values(audioElements)) {
    if (audio) audio.volume = currentVolume;
  }
  for (const audio of andonAudioInstances) {
    audio.volume = currentVolume;
  }
}

export function stopCallSound(key: SoundKey): void {
  stopTimer(key);
  const audio = audioElements[key];
  if (audio) {
    if (currentAndonAudio === audio) {
      stopCurrentAndonAudio();
      return;
    }
    stopAudioElement(audio);
  }
}

export function stopAllSounds(): void {
  for (const key of Object.keys(soundUrls) as SoundKey[]) {
    stopCallSound(key);
  }
  stopAllAndonRepeatTimers();
  stopCurrentAndonAudio();
}

export function stopAndonSound(machineId?: string): void {
  if (!machineId || currentAndonMachineId === machineId) {
    stopAllAndonRepeatTimers();
    stopCurrentAndonAudio();
  }
}

export async function playAndonSound(
  machineId: string,
  subtype: CallSubtype,
  repeatIntervalSeconds = 10,
): Promise<void> {
  if (!unlocked) return;
  if (!isMachineSoundEnabled(machineId)) return;

  const callType = getCallTypeOption(subtype);
  if (!callType) return;

  stopAllAndonRepeatTimers();
  stopCurrentAndonAudio();

  const playbackToken = currentPlaybackToken + 1;
  currentPlaybackToken = playbackToken;

  const key = callType.soundKey;
  let audio = await createCustomAudio(machineId, subtype);

  if (playbackToken !== currentPlaybackToken) {
    if (audio) {
      stopAudioElement(audio);
      releaseCustomAudio(audio);
    }
    return;
  }

  if (!audio) {
    audio = ensureAudio(key);
  }

  if (!audio) return;

  try {
    currentAndonAudio = audio;
    currentAndonMachineId = machineId;
    andonAudioInstances.add(audio);
    await playAudio(audio);
  } catch (err) {
    releaseCustomAudio(audio);
    if (playbackToken === currentPlaybackToken) {
      console.warn("[sound] play failed", err);
    }
    return;
  }

  if (playbackToken !== currentPlaybackToken) {
    stopAudioElement(audio);
    releaseCustomAudio(audio);
    return;
  }

  const endedListener = () => {
    if (playbackToken !== currentPlaybackToken) return;

    if (repeatIntervalSeconds <= 0) {
      releaseCustomAudio(audio);
      return;
    }

    stopTimer(key);
    repeatTimers[key] = window.setTimeout(() => {
      delete repeatTimers[key];
      if (playbackToken !== currentPlaybackToken) return;
      void playAudio(audio).catch((error) => {
        if (playbackToken === currentPlaybackToken) {
          console.warn("[sound] repeat failed", error);
        }
      });
    }, repeatIntervalSeconds * 1000);
  };

  audio.addEventListener("ended", endedListener);
  currentEndedListener = { audio, listener: endedListener };
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
  const fallbackAudio = ensureAudio(callType.soundKey);
  if (!fallbackAudio) return false;
  await playAudio(fallbackAudio);
  return true;
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}
