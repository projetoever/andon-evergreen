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

const DEFAULT_API_PORT =
  import.meta.env.VITE_ANDON_API_PORT?.trim() || "3001";

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveDefaultBaseUrl() {
  const configuredBaseUrl =
    import.meta.env.VITE_ANDON_API_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl);
  }

  if (
    typeof window !== "undefined" &&
    window.location?.hostname
  ) {
    const protocol = window.location.protocol || "http:";

    return `${protocol}//${window.location.hostname}:${DEFAULT_API_PORT}`;
  }

  return `http://localhost:${DEFAULT_API_PORT}`;
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
  delete<T>(path: string): Promise<T>;
}

function buildErrorMessage(
  status: number,
  payload: unknown,
) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload
  ) {
    const message = (
      payload as { message?: unknown }
    ).message;

    if (
      typeof message === "string" &&
      message.trim()
    ) {
      return message;
    }
  }

  return `Falha ao comunicar com a API ANDON (HTTP ${status}).`;
}

export function createAndonApiClient(
  config: AndonApiClientConfig =
    DEFAULT_ANDON_API_CLIENT_CONFIG,
): AndonApiClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  const normalizeUrl = (path: string) =>
    `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const url = normalizeUrl(path);

    let response: Response;

    try {
      response = await fetch(url, {
        ...init,
        headers: {
          ...(init.body
            ? { "Content-Type": "application/json" }
            : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      console.error(
        "Falha de rede ao chamar a API ANDON.",
        {
          url,
          error,
        },
      );

      throw new AndonApiError(
        `API ANDON indisponível em ${baseUrl}. Verifique backend, firewall, IP e CORS.`,
      );
    }

    const text = await response.text();

    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      throw new AndonApiError(
        buildErrorMessage(
          response.status,
          payload,
        ),
        response.status,
      );
    }

    return payload as T;
  }

  return {
    request,
    get: (path) =>
      request(path, {
        method: "GET",
      }),
    post: (path, body) =>
      request(path, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    patch: (path, body) =>
      request(path, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (path) =>
      request(path, {
        method: "DELETE",
      }),
  };
}
