import { CheckCircle2 } from "lucide-react";

import { getCallTypeOption } from "@/data/callTypes";
import { cn } from "@/lib/utils";
import type { AndonCall } from "@/types/andon";
import { getAndonStatusLabel } from "@/utils/statusUtils";

interface MachineActiveCallSelectorProps {
  calls: AndonCall[];
  selectedCallId: string | null;
  onSelect: (callId: string) => void;
}

export function MachineActiveCallSelector({
  calls,
  selectedCallId,
  onSelect,
}: MachineActiveCallSelectorProps) {
  if (calls.length < 2) return null;

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-md lg:flex-nowrap">
      <div className="flex min-w-[210px] shrink-0 items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Selecione o chamado para operar
        </h3>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
          {calls.length} ativos
        </span>
      </div>
      <div
        className="grid min-w-0 flex-1 gap-1.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))" }}
      >
        {calls.map((call) => {
          const selected = call.id === selectedCallId;
          const callType = getCallTypeOption(call.subtype);
          const accentColor = callType?.color;
          return (
            <button
              key={call.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(call.id)}
              className={cn(
                "relative min-w-0 overflow-hidden rounded-lg border-2 py-1.5 pl-3.5 pr-2.5 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-background hover:border-primary/40 hover:bg-accent",
              )}
              style={selected && accentColor ? { borderColor: accentColor } : undefined}
            >
              {accentColor && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ backgroundColor: accentColor }}
                />
              )}
              <div className="flex min-w-0 items-center gap-1.5">
                {selected && (
                  <CheckCircle2
                    className="h-4 w-4 shrink-0 text-primary"
                    style={accentColor ? { color: accentColor } : undefined}
                  />
                )}
                <span className="truncate text-sm font-black">
                  {callType?.label ?? call.subtype}
                </span>
              </div>
              <div className="mt-0.5 flex min-w-0 items-center justify-between gap-1">
                <p className="truncate text-[11px] text-muted-foreground">
                  {getAndonStatusLabel(call.status)}
                </p>
                {selected && (
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-foreground">
                    Selecionado
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
