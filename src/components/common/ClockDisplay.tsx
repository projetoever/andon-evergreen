import { useEffect, useState } from "react";

export function ClockDisplay() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const date = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground">
        {time}
      </span>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{date}</span>
    </div>
  );
}
