import {
  clearAdminSession,
  getAdminAuthorizationHeader,
} from "@/services/adminSessionStorage";
import { getCurrentWorkstationId } from "@/services/workstationIdentityService";
import { clearModuleSession, getModuleAuthorizationHeaders } from "@/services/moduleSessionStorage";
import { getCentralCsrf } from "@/services/centralCsrf";

export interface AndonApiClientConfig {
  baseUrl: string;
  timeoutMs: number;
}

export class AndonApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AndonApiError";
  }
}

const viteEnv = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }
).env;

const DEFAULT_API_PORT = viteEnv?.VITE_ANDON_API_PORT?.trim() || "3001";

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveDefaultBaseUrl() {
  const configuredBaseUrl = viteEnv?.VITE_ANDON_API_BASE_URL?.trim();

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

  // Safe, operator-actionable messages. The backend intentionally returns
  // stable error codes without authentication internals or session secrets.
  const code = payload && typeof payload === "object" && "error" in payload
    ? (payload as { error?: unknown }).error
    : null;
  const knownErrors: Record<string, string> = {
    central_action_not_supported: "Esta operação está desabilitada para o acesso central no servidor. Solicite a liberação controlada ao administrador.",
    workstation_inactive: "Esta workstation está desativada ou aguardando aprovação. Solicite autorização antes de abrir chamados.",
    workstation_identification_required: "Não foi possível identificar esta workstation. Reabra o Hub e conclua a identificação.",
    workstation_session_mismatch: "A sessão não corresponde à workstation atual. Faça login novamente neste dispositivo.",
    authentication_required: "Sua sessão não está válida. Identifique-se novamente no Hub.",
    csrf_denied: "A verificação de segurança da sessão falhou. Faça login novamente e tente uma nova abertura.",
    permission_denied: "Seu usuário não tem permissão para executar esta operação.",
    machine_scope_denied: "Seu usuário não tem permissão para abrir chamados nesta máquina.",
    origin_denied: "A origem HTTPS do navegador não corresponde à origem autorizada do servidor.",
    https_required: "O acesso seguro HTTPS é obrigatório para esta operação.",
    hierarchical_calls_disabled: "A abertura com motivo e especialidade não está habilitada no servidor.",
    reserved_call_origin: "O servidor recusou metadados de origem do chamado. Atualize a interface e tente novamente.",
    rate_limited: "Muitas solicitações seguidas. Aguarde e tente novamente.",
  };
  if (typeof code === "string" && Object.prototype.hasOwnProperty.call(knownErrors, code)) {
    return `${knownErrors[code]} (HTTP ${status} · ${code})`;
  }
  return `Falha ao comunicar com a API ANDON (HTTP ${status}${typeof code === "string" && /^[a-z_]{1,64}$/.test(code) ? ` · ${code}` : ""}).`;
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
    const workstationId = getCurrentWorkstationId();
    const adminAuthorization = getAdminAuthorizationHeader();
    const method = (init.method ?? "GET").toUpperCase();
    // Only the reviewed, narrowly opted-in central mutations need the
    // derived CSRF header. The legacy API path remains unchanged.
    const needsCentralCsrf =
      (method === "PATCH" && /^\/api\/andon-calls\/[^/]+\/attend$/.test(path)) ||
      (method === "PATCH" && /^\/api\/andon-calls\/[^/]+\/finish-maintenance$/.test(path)) ||
      (method === "PATCH" && /^\/api\/andon-calls\/[^/]+\/return-to-maintenance$/.test(path)) ||
      (method === "PATCH" && /^\/api\/andon-calls\/[^/]+\/finish$/.test(path)) ||
      (method === "PATCH" && /^\/api\/andon-calls\/[^/]+\/cancel$/.test(path)) ||
      (method === "PATCH" && /^\/api\/andon-calls\/[^/]+\/technicians\/end$/.test(path)) ||
      (method === "PATCH" && /^\/api\/andon-calls\/[^/]+\/failure-details$/.test(path)) ||
      (method === "POST" && /^\/api\/andon-calls\/[^/]+\/technicians$/.test(path)) ||
      (method === "POST" && path === "/api/machines") ||
      (method === "POST" && path === "/api/technicians") ||
      (method === "PATCH" && /^\/api\/technicians\/[a-zA-Z0-9_-]{1,160}$/.test(path)) ||
      (method === "PATCH" && /^\/api\/shifts\/[a-zA-Z0-9_-]{1,160}$/.test(path)) ||
      (method === "POST" && path === "/api/andon-categories") ||
      (method === "PATCH" && /^\/api\/andon-categories\/[a-z0-9_]{2,40}$/.test(path)) ||
      (method === "POST" && /^\/api\/machines\/[A-Za-z0-9_-]{1,160}\/sets$/.test(path)) ||
      (method === "PATCH" && /^\/api\/machine-sets\/[A-Za-z0-9_-]{1,160}$/.test(path)) ||
      (method === "POST" && /^\/api\/machine-sets\/[A-Za-z0-9_-]{1,160}\/subsets$/.test(path)) ||
      (method === "PATCH" && /^\/api\/machine-subsets\/[A-Za-z0-9_-]{1,160}$/.test(path)) ||
      (method === "POST" && (path === "/api/machine-set-types" || path === "/api/machine-subset-types")) ||
      (method === "PATCH" && /^\/api\/machine-(?:set|subset)-types\/[A-Za-z0-9_-]{1,160}$/.test(path)) ||
      (method === "POST" && path === "/api/technicians/identify") ||
      (method === "PATCH" && path === "/api/system-settings") ||
      (method === "PATCH" && path === "/api/andon-visual-palette") ||
      ((method === "POST" || method === "PATCH") &&
       /^\/api\/failure-classifications(?:\/[^/]+)?$/.test(path)) ||
      (method === "PUT" && path === "/api/dashboard-priority/order") ||
      (method === "PATCH" && /^\/api\/workstations\/[^/]+\/screen-lock$/.test(path)) ||
      (method === "PUT" && /^\/api\/workstations\/[^/]+\/machine-sound\/[^/]+$/.test(path)) ||
      (method === "POST" && (path === "/api/andon-calls" || path === "/api/andon-calls/batch"));
    const centralCsrf = needsCentralCsrf
      ? await getCentralCsrf(baseUrl, workstationId ?? "") : null;

    let response: Response;

    try {
      response = await fetch(url, {
        ...init,
        credentials: "include",
        headers: {
          ...(init.body
            ? { "Content-Type": "application/json" }
            : {}),
          ...(workstationId ? { "X-Andon-Workstation-Id": workstationId } : {}),
          ...(adminAuthorization ? { Authorization: adminAuthorization } : {}),
          ...getModuleAuthorizationHeaders(),
          ...(centralCsrf ? { "X-Andon-CSRF": centralCsrf } : {}),
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
      if (response.status === 401 && payload && typeof payload === "object" &&
          "error" in payload && payload.error === "module_auth_required" && "module" in payload &&
          (payload.module === "operational" || payload.module === "bi")) {
        clearModuleSession(payload.module);
        if (typeof window !== "undefined") window.dispatchEvent(new Event("andon:module-session-changed"));
      }
      if (response.status === 403 && payload && typeof payload === "object" &&
          "error" in payload && payload.error === "module_forbidden" && typeof window !== "undefined") {
        window.dispatchEvent(new Event("andon:module-forbidden"));
      }
      if (
        response.status === 403 &&
        payload && typeof payload === "object" &&
        "error" in payload &&
        (payload as { error?: unknown }).error === "workstation_inactive" &&
        typeof window !== "undefined"
      ) {
        window.dispatchEvent(new Event("andon:workstation-inactive"));
      }
      if (
        response.status === 401 &&
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        (payload as { error?: unknown }).error === "admin_auth_required"
      ) {
        clearAdminSession();
        if (typeof window !== "undefined") window.dispatchEvent(new Event("andon:admin-session-expired"));
      }

      throw new AndonApiError(
        buildErrorMessage(
          response.status,
          payload,
        ),
        response.status,
        payload && typeof payload === "object" && "error" in payload &&
          typeof (payload as { error?: unknown }).error === "string" &&
          /^[a-z_]{1,64}$/.test((payload as { error: string }).error)
          ? (payload as { error: string }).error
          : undefined,
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
