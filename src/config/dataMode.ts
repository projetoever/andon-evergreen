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
 * A partir do instalador V10.6.1, o ANDON opera em modo API por padrão.
 * O modo local permanece disponível apenas para testes controlados.
 */
export const DEFAULT_DATA_MODE: DataMode = API_DATA_MODE;

export const CONFIGURED_DATA_MODE: DataMode =
  normalizeDataMode(import.meta.env.VITE_ANDON_DATA_MODE) ?? DEFAULT_DATA_MODE;

export const IS_API_DATA_MODE = CONFIGURED_DATA_MODE === API_DATA_MODE;
