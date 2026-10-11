import { DEFAULT_ANDON_API_CLIENT_CONFIG } from "@/api/andonApiClient";

export class AndonBiApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AndonBiApiError";
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

const baseUrl = normalizeBaseUrl(DEFAULT_ANDON_API_CLIENT_CONFIG.baseUrl);

async function get<T>(path: string): Promise<T> {
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(DEFAULT_ANDON_API_CLIENT_CONFIG.timeoutMs),
    });
  } catch (error) {
    console.error("Falha ao consultar API read-only do ANDON BI.", { url, error });
    throw new AndonBiApiError(
      `API ANDON indisponível em ${baseUrl}. Verifique backend, rede e firewall.`,
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
    const message =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof (payload as { message?: unknown }).message === "string"
        ? String((payload as { message: string }).message)
        : `Falha ao consultar ANDON BI (HTTP ${response.status}).`;

    throw new AndonBiApiError(message, response.status);
  }

  return payload as T;
}

export const andonBiApiClient = {
  get,
};
