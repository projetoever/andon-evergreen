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
          Chamados ativos nesta máquina
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
          return (
            <button
              key={call.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(call.id)}
              className={cn(
                "min-w-0 rounded-lg border-2 px-2.5 py-1.5 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/40 hover:bg-accent",
              )}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                <span className="truncate text-sm font-black">
                  {getCallTypeOption(call.subtype)?.label ?? call.subtype}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {getAndonStatusLabel(call.status)}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
