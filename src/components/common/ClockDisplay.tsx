import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatLocalTime, scheduleClockUpdates } from "@/utils/localClockUtils";

interface ClockDisplayProps {
  className?: string;
}

export function ClockDisplay({ className }: ClockDisplayProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    return scheduleClockUpdates(() => setNow(new Date()));
  }, []);

  const time = formatLocalTime(now);

  return (
    <time
      dateTime={now.toISOString()}
      aria-label={`Hora atual: ${time}`}
      title="Hora atual"
      className={cn(
        "pointer-events-none inline-flex shrink-0 select-none items-center rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-sm font-semibold tabular-nums leading-none text-muted-foreground md:text-base",
        className,
      )}
    >
      {time}
    </time>
  );
}
