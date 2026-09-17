import { cn } from "@/lib/utils";

interface CallIdLabelProps {
  callId: string;
  className?: string;
}

export function CallIdLabel({ callId, className }: CallIdLabelProps) {
  return (
    <span
      className={cn(
        "block min-w-0 max-w-full break-all font-mono text-[10px] leading-snug text-muted-foreground",
        className,
      )}
      title={`ID do chamado: ${callId}`}
    >
      ID do chamado: {callId}
    </span>
  );
}
