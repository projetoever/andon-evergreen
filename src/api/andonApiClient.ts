export interface AndonApiClientConfig {
  baseUrl: string;
  timeoutMs: number;
}

export class AndonApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AndonApiError";
  }
}

function resolveDefaultBaseUrl() {
  const configured = import.meta.env.VITE_ANDON_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  if (typeof window !== "undefined" && window.location?.hostname) {
    const protocol = window.location.protocol || "http:";
    return `${protocol}//${window.location.hostname}:3001`;
  }

  return "http://localhost:3001";
}

export const DEFAULT_ANDON_API_CLIENT_CONFIG: AndonApiClientConfig = {
  baseUrl: resolveDefaultBaseUrl(),
  timeoutMs: 10_000,
};

export interface AndonApiClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
}

function buildErrorMessage(status: number, payload: unknown) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `Falha ao comunicar com a API ANDON (HTTP ${status}).`;
}

export function createAndonApiClient(
  config: AndonApiClientConfig = DEFAULT_ANDON_API_CLIENT_CONFIG,
): AndonApiClient {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const normalizeUrl = (path: string) => `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(normalizeUrl(path), {
        ...init,
        headers: {
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch {
      throw new AndonApiError("API ANDON indisponível. Verifique se o backend está em execução.");
    }

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new AndonApiError(buildErrorMessage(response.status, payload), response.status);
    }

    return payload as T;
  }

  return {
    request,
    get: (path) => request(path, { method: "GET" }),
    post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
    patch: (path, body) => request(path, { method: "PATCH", body: JSON.stringify(body) }),
  };
}
