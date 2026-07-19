export type DataMode = "local" | "api";

const LOCAL_DATA_MODE: DataMode = "local";
const API_DATA_MODE: DataMode = "api";

const SUPPORTED_DATA_MODES = [
  LOCAL_DATA_MODE,
  API_DATA_MODE,
] as const;

function normalizeDataMode(
  value: string | undefined,
): DataMode | null {
  const normalized = value?.trim().toLowerCase();

  return SUPPORTED_DATA_MODES.includes(
    normalized as DataMode,
  )
    ? (normalized as DataMode)
    : null;
}

/**
 * Modo padrão do frontend ANDON.
 *
 * A partir da release 1.0.0-pilot.2:
 *
 * - builds de produção operam obrigatoriamente pela API;
 * - o instalador e o menu ANDON geram builds em modo API;
 * - LocalStorage pode ser selecionado somente em desenvolvimento;
 * - não existe fallback silencioso para LocalStorage em produção.
 */
export const DEFAULT_DATA_MODE: DataMode =
  API_DATA_MODE;

function resolveConfiguredDataMode(): DataMode {
  if (import.meta.env.PROD) {
    return API_DATA_MODE;
  }

  return (
    normalizeDataMode(
      import.meta.env.VITE_ANDON_DATA_MODE,
    ) ?? DEFAULT_DATA_MODE
  );
}

export const CONFIGURED_DATA_MODE: DataMode =
  resolveConfiguredDataMode();

export const IS_API_DATA_MODE =
  CONFIGURED_DATA_MODE === API_DATA_MODE;

export const IS_LOCAL_DATA_MODE =
  CONFIGURED_DATA_MODE === LOCAL_DATA_MODE;