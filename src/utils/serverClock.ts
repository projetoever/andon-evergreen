let serverTimeOffsetMs = 0;
let lastServerTimestampIso: string | null = null;
let serverTimeZone: string | null = null;
let serverClockSynchronized = false;
let serverClockRevision = 0;
const listeners = new Set<() => void>();

function isFiniteTimestamp(value: number) {
  return Number.isFinite(value) && !Number.isNaN(value);
}

export function calculateServerTimeOffsetMs(
  serverTimestampIso: string | null | undefined,
  clientStartedAtMs = Date.now(),
  clientEndedAtMs = Date.now(),
): number | null {
  if (!serverTimestampIso) return null;

  const serverMs = new Date(serverTimestampIso).getTime();
  if (!isFiniteTimestamp(serverMs)) return null;

  const clientMidpointMs = Math.round((clientStartedAtMs + clientEndedAtMs) / 2);
  return serverMs - clientMidpointMs;
}

export function setServerTimeOffsetMs(offsetMs: number | null | undefined): number {
  if (typeof offsetMs === "number" && Number.isFinite(offsetMs)) {
    serverTimeOffsetMs = offsetMs;
  }
  return serverTimeOffsetMs;
}

export function setServerClockFromTimestamp(
  serverTimestampIso: string | null | undefined,
  clientStartedAtMs = Date.now(),
  clientEndedAtMs = Date.now(),
  timeZone?: string | null,
): number {
  const nextOffsetMs = calculateServerTimeOffsetMs(
    serverTimestampIso,
    clientStartedAtMs,
    clientEndedAtMs,
  );
  if (nextOffsetMs !== null) {
    lastServerTimestampIso = serverTimestampIso ?? null;
    serverTimeOffsetMs = nextOffsetMs;
    serverTimeZone = normalizeTimeZone(timeZone) ?? serverTimeZone;
    serverClockSynchronized = true;
    serverClockRevision += 1;
    listeners.forEach((listener) => listener());
  }
  return serverTimeOffsetMs;
}

function normalizeTimeZone(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
    return value;
  } catch {
    return null;
  }
}

export function getServerTimeOffsetMs(): number {
  return serverTimeOffsetMs;
}

export function getLastServerTimestampIso(): string | null {
  return lastServerTimestampIso;
}

export function getServerTimeZone(): string | null {
  return serverTimeZone;
}

export function isServerClockSynchronized(): boolean {
  return serverClockSynchronized;
}

export function getServerClockRevision(): number {
  return serverClockRevision;
}

export function subscribeServerClock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetServerClockForTests(): void {
  serverTimeOffsetMs = 0;
  lastServerTimestampIso = null;
  serverTimeZone = null;
  serverClockSynchronized = false;
  serverClockRevision += 1;
  listeners.forEach((listener) => listener());
}

export function getServerNow(): Date {
  return new Date(Date.now() + serverTimeOffsetMs);
}

export function getServerNowIso(): string {
  return getServerNow().toISOString();
}
