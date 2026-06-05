import type { AndonSnapshot } from "@/repositories/andonRepository";

export interface AndonApiClientConfig {
  baseUrl: string;
  timeoutMs: number;
}

export interface AndonApiClient {
  getSnapshot(): Promise<AndonSnapshot>;
  replaceSnapshot(snapshot: AndonSnapshot): Promise<AndonSnapshot>;
}

export const DEFAULT_ANDON_API_CLIENT_CONFIG: AndonApiClientConfig = {
  baseUrl: import.meta.env.VITE_ANDON_API_BASE_URL ?? "http://localhost:3000",
  timeoutMs: 10_000,
};

/**
 * Cliente reservado para a futura API Node.js local.
 *
 * Ele ainda não é instanciado pelo frontend atual. Raspberry/kiosks deverão falar
 * com a API por HTTP/WebSocket; somente a API acessará o PostgreSQL.
 */
export function createAndonApiClient(
  config: AndonApiClientConfig = DEFAULT_ANDON_API_CLIENT_CONFIG,
): AndonApiClient {
  const normalizeUrl = (path: string) => `${config.baseUrl.replace(/\/$/, "")}${path}`;

  return {
    async getSnapshot() {
      const response = await fetch(normalizeUrl("/api/andon/snapshot"), {
        method: "GET",
        signal: AbortSignal.timeout(config.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Falha ao carregar snapshot ANDON da API: ${response.status}`);
      }

      return response.json() as Promise<AndonSnapshot>;
    },

    async replaceSnapshot(snapshot) {
      const response = await fetch(normalizeUrl("/api/andon/snapshot"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
        signal: AbortSignal.timeout(config.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Falha ao salvar snapshot ANDON na API: ${response.status}`);
      }

      return response.json() as Promise<AndonSnapshot>;
    },
  };
}
