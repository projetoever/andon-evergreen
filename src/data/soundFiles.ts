import type { SoundConfig } from "@/types/settings";

export const SOUND_CONFIGS: SoundConfig[] = [
  {
    key: "electrical",
    label: "Elétrica",
    fileName: "eletrica.mp3",
    enabled: true,
    repeatUntilAttended: true,
    repeatIntervalSeconds: 10,
  },
  {
    key: "mechanical",
    label: "Mecânica",
    fileName: "mecanica.mp3",
    enabled: true,
    repeatUntilAttended: true,
    repeatIntervalSeconds: 10,
  },
  {
    key: "hot_melt",
    label: "Hot Melt",
    fileName: "hot-melt.mp3",
    enabled: true,
    repeatUntilAttended: true,
    repeatIntervalSeconds: 10,
  },
  {
    key: "quality",
    label: "Qualidade",
    fileName: "qualidade.mp3",
    enabled: true,
    repeatUntilAttended: true,
    repeatIntervalSeconds: 10,
  },
  {
    key: "leadership",
    label: "Liderança",
    fileName: "lideranca.mp3",
    enabled: true,
    repeatUntilAttended: true,
    repeatIntervalSeconds: 10,
  },
];
