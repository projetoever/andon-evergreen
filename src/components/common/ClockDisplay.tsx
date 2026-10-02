import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { IS_API_DATA_MODE } from "@/config/dataMode";
import { formatLocalTime, scheduleClockUpdates } from "@/utils/localClockUtils";
import {
  getServerNow,
  getServerTimeZone,
  isServerClockSynchronized,
  subscribeServerClock,
} from "@/utils/serverClock";

interface ClockDisplayProps {
  className?: string;
}

export function ClockDisplay({ className }: ClockDisplayProps) {
  const getOperationalNow = () =>
    IS_API_DATA_MODE && !isServerClockSynchronized()
      ? null
      : IS_API_DATA_MODE
        ? getServerNow()
        : new Date();
  const [now, setNow] = useState<Date | null>(getOperationalNow);

  useEffect(() => {
    const update = () => setNow(getOperationalNow());
    const stopClock = scheduleClockUpdates(update);
    const unsubscribe = subscribeServerClock(update);
    return () => {
      stopClock();
      unsubscribe();
    };
  }, []);

  const time = now ? formatLocalTime(now, IS_API_DATA_MODE ? getServerTimeZone() : null) : "—:—";

  return (
    <time
      dateTime={now?.toISOString()}
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
