let serverTimeOffsetMs = 0;
let lastServerTimestampIso: string | null = null;

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
): number {
  const nextOffsetMs = calculateServerTimeOffsetMs(serverTimestampIso, clientStartedAtMs, clientEndedAtMs);
  if (nextOffsetMs !== null) {
    lastServerTimestampIso = serverTimestampIso ?? null;
    serverTimeOffsetMs = nextOffsetMs;
  }
  return serverTimeOffsetMs;
}

export function getServerTimeOffsetMs(): number {
  return serverTimeOffsetMs;
}

export function getLastServerTimestampIso(): string | null {
  return lastServerTimestampIso;
}

export function getServerNow(): Date {
  return new Date(Date.now() + serverTimeOffsetMs);
}

export function getServerNowIso(): string {
  return getServerNow().toISOString();
}
