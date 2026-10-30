/** The central session secret never leaves the HttpOnly cookie.
 * Only a derived anti-CSRF token is held in memory for the current page.
 * No persistent browser storage or user credentials are retained.
 */
let centralMode = false;
let csrf = "";
let loading: Promise<string> | null = null;

export function isCentralMode() { return centralMode; }
export function setCentralMode(enabled: boolean) {
  centralMode = enabled;
  if (!enabled) csrf = "";
}
export function setCentralCsrf(value: unknown) {
  csrf = typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : "";
}
export function clearCentralCsrf() { csrf = ""; }

/** One guarded bootstrap after reload with an existing HttpOnly cookie. */
export async function getCentralCsrf(baseUrl: string, workstationId: string): Promise<string | null> {
  if (!centralMode) return null;
  if (csrf) return csrf;
  if (!workstationId || typeof window === "undefined" ||
      window.location.protocol !== "https:" || !baseUrl.startsWith("https://"))
    throw new Error("https_required");
  if (!loading) loading = (async () => {
    const response = await fetch(baseUrl.replace(/\/$/, "") + "/api/access/session", {
      method: "GET", credentials: "include", cache: "no-store",
      headers: { "X-Andon-Workstation-Id": workstationId },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("authentication_required");
    const data = await response.json() as { csrf?: unknown };
    setCentralCsrf(data.csrf);
    if (!csrf) throw new Error("csrf_denied");
    return csrf;
  })().finally(() => { loading = null; });
  return loading;
}
