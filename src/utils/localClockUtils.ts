const CLOCK_UPDATE_INTERVAL_MS = 1000;

interface ClockScheduler {
  setInterval: (callback: () => void, delay: number) => number;
  clearInterval: (intervalId: number) => void;
}

const browserClockScheduler: ClockScheduler = {
  setInterval: (callback, delay) => window.setInterval(callback, delay),
  clearInterval: (intervalId) => window.clearInterval(intervalId),
};

export function formatLocalTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function scheduleClockUpdates(
  onTick: () => void,
  scheduler: ClockScheduler = browserClockScheduler,
): () => void {
  const intervalId = scheduler.setInterval(onTick, CLOCK_UPDATE_INTERVAL_MS);
  return () => scheduler.clearInterval(intervalId);
}
