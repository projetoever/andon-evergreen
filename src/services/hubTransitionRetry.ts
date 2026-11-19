/**
 * Hub start-up and route revalidation get one short retry for connection
 * interruptions only. Never retry or conceal authorization / policy denials.
 * The caller must still wait for a fresh successful server decision.
 */
export function isRetryableHubTransitionFailure(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as { name?: unknown; status?: unknown };
  if (typeof error.status === "number") {
    return error.status === 408 || error.status === 429 ||
      (error.status >= 500 && error.status <= 599);
  }
  return error.name === "TypeError" ||
    error.name === "TimeoutError" || error.name === "AbortError" ||
    error.name === "AndonApiError";
}

export async function withHubTransientRetry<T>(
  request: () => Promise<T>,
  wait: (ms: number) => Promise<void> =
    (ms) => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<T> {
  try {
    return await request();
  } catch (cause) {
    if (!isRetryableHubTransitionFailure(cause)) throw cause;
    await wait(320);
    // Only one retry; if denied / unavailable again, show the real error.
    return request();
  }
}
