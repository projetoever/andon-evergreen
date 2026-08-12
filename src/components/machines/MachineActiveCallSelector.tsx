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
    <section className="rounded-xl border border-border bg-card p-2.5 shadow-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Chamados ativos nesta máquina
        </h3>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
          {calls.length} ativos
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {calls.map((call) => {
          const selected = call.id === selectedCallId;
          return (
            <button
              key={call.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(call.id)}
              className={cn(
                "min-w-0 rounded-xl border-2 px-3 py-2 text-left transition-colors",
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
