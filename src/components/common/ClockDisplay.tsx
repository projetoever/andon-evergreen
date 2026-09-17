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
        "inline-flex shrink-0 items-center rounded-md border border-border bg-card px-2.5 py-1 font-mono text-base font-bold tabular-nums leading-none text-muted-foreground md:text-lg",
        className,
      )}
    >
      {time}
    </time>
  );
}
