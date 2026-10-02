import { IS_API_DATA_MODE } from "@/config/dataMode";
import { getServerNow, getServerTimeZone } from "@/utils/serverClock";

const DISPLAY_TIME_ZONE = "America/Sao_Paulo";

function getDisplayTimeZone() {
  return IS_API_DATA_MODE ? (getServerTimeZone() ?? DISPLAY_TIME_ZONE) : DISPLAY_TIME_ZONE;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: getDisplayTimeZone(),
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: getDisplayTimeZone(),
  });
}

export function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = IS_API_DATA_MODE ? getServerNow() : new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: getDisplayTimeZone(),
    year: "numeric",
  });
  return formatter.format(d) === formatter.format(now);
}
