import type { CallSubtype, SoundKey } from "@/types/andon";
import { getCallTypeOption } from "@/data/callTypes";
import { DEFAULT_SOUND_MACHINE_ID, type SoundMachineId } from "@/types/sound";
import { getSoundBlob } from "@/services/soundStorageService";

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
let unlocked = false;
let currentVolume = 0.8;
let currentAndonAudio: HTMLAudioElement | null = null;

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
    window.clearInterval(id);
    delete repeatTimers[key];
  }
}

async function playAudio(audio: HTMLAudioElement): Promise<void> {
  audio.currentTime = 0;
  audio.volume = currentVolume;
  await audio.play();
}

function stopCurrentAndonAudio(): void {
  if (!currentAndonAudio) return;
  try {
    currentAndonAudio.pause();
    currentAndonAudio.currentTime = 0;
  } catch {
    // ignore
  }
  currentAndonAudio = null;
}

async function createCustomAudio(machineId: SoundMachineId, subtype: CallSubtype): Promise<HTMLAudioElement | null> {
  const machineBlob = await getSoundBlob(machineId, subtype);
  const fallbackBlob = machineId === DEFAULT_SOUND_MACHINE_ID ? null : await getSoundBlob(DEFAULT_SOUND_MACHINE_ID, subtype);
  const blob = machineBlob ?? fallbackBlob;
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.volume = currentVolume;
  audio.onended = () => URL.revokeObjectURL(url);
  return audio;
}

export function unlockAudio(): void {
  unlocked = true;
  for (const key of Object.keys(soundUrls) as SoundKey[]) {
    const audio = ensureAudio(key);
    if (!audio) continue;
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
    }).catch(() => {});
  }
}

export function setSoundVolume(volume: number): void {
  currentVolume = Math.max(0, Math.min(1, volume));
  for (const audio of Object.values(audioElements)) {
    if (audio) audio.volume = currentVolume;
  }
}

export function stopCallSound(key: SoundKey): void {
  stopTimer(key);
  const audio = audioElements[key];
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    if (currentAndonAudio === audio) {
      currentAndonAudio = null;
    }
  }
}

export function stopAllSounds(): void {
  for (const key of Object.keys(soundUrls) as SoundKey[]) {
    stopCallSound(key);
  }
  stopCurrentAndonAudio();
}

export function stopAndonSound(): void {
  stopCurrentAndonAudio();
  for (const key of Object.keys(soundUrls) as SoundKey[]) {
    stopTimer(key);
  }
}

export async function playAndonSound(machineId: string, subtype: CallSubtype, repeatIntervalSeconds = 10): Promise<void> {
  if (!unlocked) return;
  const callType = getCallTypeOption(subtype);
  if (!callType) return;
  const key = callType.soundKey;

  let audio = await createCustomAudio(machineId, subtype);
  if (!audio) {
    audio = ensureAudio(key);
  }
  if (!audio) return;

  try {
    currentAndonAudio = audio;
    await playAudio(audio);
  } catch (err) {
    console.warn("[sound] play failed", err);
    return;
  }

  stopTimer(key);
  if (repeatIntervalSeconds > 0) {
    repeatTimers[key] = window.setInterval(() => {
      void playAudio(audio as HTMLAudioElement).catch(() => undefined);
    }, repeatIntervalSeconds * 1000);
  }
}

export async function testAndonSound(machineId: SoundMachineId, subtype: CallSubtype): Promise<boolean> {
  if (!unlocked) return false;
  const customAudio = await createCustomAudio(machineId, subtype);
  if (customAudio) {
    await playAudio(customAudio);
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
