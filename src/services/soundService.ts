import type { SoundKey } from "@/types/andon";

// Importa todos os sons como URL. Se o arquivo não existir, o import falha
// silenciosamente em runtime — tratamos com try/catch ao tocar.
const soundUrls: Record<SoundKey, string | null> = {
  electrical: null,
  mechanical: null,
  hot_melt: null,
  quality: null,
  leadership: null,
};

// Tenta carregar arquivos via import.meta.glob (Vite). Se não existirem,
// soundUrls permanece null e o sistema continua funcionando.
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

function ensureAudio(key: SoundKey): HTMLAudioElement | null {
  const url = soundUrls[key];
  if (!url) return null;
  if (!audioElements[key]) {
    try {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = currentVolume;
      audioElements[key] = audio;
    } catch (err) {
      console.warn(`[sound] could not create audio for ${key}`, err);
      return null;
    }
  }
  return audioElements[key] ?? null;
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
      .catch(() => {
        /* expected on first interaction */
      });
  }
}

export function setSoundVolume(volume: number): void {
  currentVolume = Math.max(0, Math.min(1, volume));
  for (const audio of Object.values(audioElements)) {
    if (audio) audio.volume = currentVolume;
  }
}

export function playCallSound(key: SoundKey, repeatIntervalSeconds = 10): void {
  if (!unlocked) {
    console.warn("[sound] audio not unlocked yet");
  }
  const audio = ensureAudio(key);
  if (!audio) {
    console.warn(`[sound] no audio file for ${key}`);
    return;
  }
  try {
    audio.currentTime = 0;
    audio.play().catch((err) => console.warn(`[sound] play failed for ${key}`, err));
  } catch (err) {
    console.warn(`[sound] play exception for ${key}`, err);
  }
  stopTimer(key);
  if (repeatIntervalSeconds > 0) {
    repeatTimers[key] = window.setInterval(() => {
      const a = audioElements[key];
      if (!a) return;
      try {
        a.currentTime = 0;
        a.play().catch(() => {});
      } catch {
        /* ignore */
      }
    }, repeatIntervalSeconds * 1000);
  }
}

function stopTimer(key: SoundKey): void {
  const id = repeatTimers[key];
  if (id) {
    window.clearInterval(id);
    delete repeatTimers[key];
  }
}

export function stopCallSound(key: SoundKey): void {
  stopTimer(key);
  const audio = audioElements[key];
  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}

export function stopAllSounds(): void {
  for (const key of Object.keys(soundUrls) as SoundKey[]) {
    stopCallSound(key);
  }
}

export function testSound(key: SoundKey): void {
  const audio = ensureAudio(key);
  if (!audio) {
    console.warn(`[sound] cannot test ${key}: file missing`);
    return;
  }
  try {
    audio.currentTime = 0;
    audio.play().catch((err) => console.warn(`[sound] test failed for ${key}`, err));
  } catch (err) {
    console.warn(`[sound] test exception for ${key}`, err);
  }
}

export function isSoundAvailable(key: SoundKey): boolean {
  return soundUrls[key] !== null;
}
