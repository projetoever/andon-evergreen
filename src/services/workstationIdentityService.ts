export const WORKSTATION_ID_STORAGE_KEY = "andon.workstationId";

const WORKSTATION_ID_PATTERN =
  /^ws_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WorkstationIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

let cachedWorkstationId: string | null = null;
let inMemoryWorkstationId: string | null = null;

const inMemoryStorage: WorkstationIdentityStorage = {
  getItem: () => inMemoryWorkstationId,
  setItem: (_key, value) => {
    inMemoryWorkstationId = value;
  },
};

export function isValidWorkstationId(value: unknown): value is string {
  return typeof value === "string" && WORKSTATION_ID_PATTERN.test(value.trim());
}

function fallbackUuid() {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Gerador criptográfico indisponível para identificar a workstation.");
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function createUuid() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : fallbackUuid();
}

export function ensureWorkstationId(
  storage: WorkstationIdentityStorage,
  uuidFactory: () => string = createUuid,
) {
  try {
    const storedId = storage.getItem(WORKSTATION_ID_STORAGE_KEY);
    if (isValidWorkstationId(storedId)) return storedId.trim().toLowerCase();
  } catch {
    // O cache em memória mantém uma identidade estável durante esta execução.
  }

  const workstationId = `ws_${uuidFactory()}`.toLowerCase();
  if (!isValidWorkstationId(workstationId)) {
    throw new Error("Não foi possível gerar um identificador válido para a workstation.");
  }

  try {
    storage.setItem(WORKSTATION_ID_STORAGE_KEY, workstationId);
  } catch {
    // localStorage pode estar bloqueado; o chamador ainda recebe uma identidade de sessão.
  }

  return workstationId;
}

function getBrowserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return inMemoryStorage;
  }
}

export function getCurrentWorkstationId() {
  if (cachedWorkstationId) return cachedWorkstationId;
  const storage = getBrowserStorage();
  if (!storage) return null;
  cachedWorkstationId = ensureWorkstationId(storage);
  return cachedWorkstationId;
}

export function resetWorkstationIdentityCacheForTests() {
  cachedWorkstationId = null;
  inMemoryWorkstationId = null;
}
