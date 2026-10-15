import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

interface CallIdLabelProps {
  callId: string;
  className?: string;
}

export function CallIdLabel({ callId, className }: CallIdLabelProps) {
  useInterfaceLanguage();
  return (
    <span
      className={cn(
        "block min-w-0 max-w-full break-all font-mono text-[10px] leading-snug text-muted-foreground",
        className,
      )}
      title={ui("ID do chamado: {0}", { 0: callId })}
    >
      {ui("ID do chamado: ")}
      {callId}
    </span>
  );
}
