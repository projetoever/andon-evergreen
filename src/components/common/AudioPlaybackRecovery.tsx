import { VolumeX } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";

export function AudioPlaybackRecovery({ onActivate }: { onActivate: () => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={onActivate}
      className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs font-bold text-warning"
    >
      <VolumeX aria-hidden="true" className="h-4 w-4 shrink-0" />
      {t("O navegador bloqueou o áudio. Toque para liberar.")}
    </button>
  );
}
