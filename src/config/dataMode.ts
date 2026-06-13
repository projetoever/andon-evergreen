export type DataMode = "local" | "api";

const LOCAL_DATA_MODE: DataMode = "local";
const API_DATA_MODE: DataMode = "api";
const SUPPORTED_DATA_MODES = [LOCAL_DATA_MODE, API_DATA_MODE] as const;

function normalizeDataMode(value: string | undefined): DataMode | null {
  const normalized = value?.trim();
  return SUPPORTED_DATA_MODES.includes(normalized as DataMode) ? (normalized as DataMode) : null;
}

/**
 * Modo padrão de dados do frontend.
 *
 * Nesta etapa o sistema continua frontend-only e LocalStorage-first. A variável
 * VITE_ANDON_DATA_MODE existe apenas para preparar a troca futura para uma API
 * Node.js local, sem ativar integrações remotas por padrão.
 */
export const DEFAULT_DATA_MODE: DataMode = LOCAL_DATA_MODE;

export const CONFIGURED_DATA_MODE: DataMode =
  normalizeDataMode(import.meta.env.VITE_ANDON_DATA_MODE) ?? DEFAULT_DATA_MODE;

export const IS_API_DATA_MODE = CONFIGURED_DATA_MODE === API_DATA_MODE;
