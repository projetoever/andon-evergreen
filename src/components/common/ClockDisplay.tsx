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
        "pointer-events-none inline-flex shrink-0 select-none items-center bg-transparent font-mono text-2xl font-bold tabular-nums leading-none text-muted-foreground md:text-3xl",
        className,
      )}
    >
      {time}
    </time>
  );
}
