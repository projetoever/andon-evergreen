import { useEffect, useState } from "react";

/**
 * Re-renderiza o componente em intervalos regulares.
 * Usado para timers ao vivo sem persistir nada no estado.
 */
export function useTicker(intervalMs = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return tick;
}
