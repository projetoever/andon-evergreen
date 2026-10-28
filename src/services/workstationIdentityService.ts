export const WORKSTATION_ID_STORAGE_KEY = "andon.workstationId";

const WORKSTATION_ID_PATTERN =
  /^ws_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKSTATION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 5;

export interface WorkstationIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

let cachedWorkstationId: string | null = null;

/**
 * Two different UUIDs for the same origin must never be silently merged.
 * Browser storage proves continuity only, not physical device ownership.
 */
export function hasWorkstationIdentityConflict() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  let cookie: string | null = null;
  try {
    cookie = readCookie(WORKSTATION_ID_STORAGE_KEY);
  } catch {
    /* Browsers can disallow cookies but keep localStorage available. */
  }
  let mirror: string | null = null;
  try {
    mirror = window.localStorage.getItem(WORKSTATION_ID_STORAGE_KEY);
  } catch {
    /* Cookie alone may remain usable. */
  }
  return isValidWorkstationId(cookie) && isValidWorkstationId(mirror) &&
    cookie.trim().toLowerCase() !== mirror.trim().toLowerCase();
}
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
    // O chamador ainda recebe uma identidade estável durante esta execução.
  }

  return workstationId;
}

function readCookie(key: string) {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(key)}=`;
  const part = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  try {
    return part ? decodeURIComponent(part.slice(prefix.length)) : null;
  } catch {
    return null;
  }
}

function writeCookie(key: string, value: string) {
  if (typeof document === "undefined") return;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; Max-Age=${WORKSTATION_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

// Cookie is shared across ports of the same hostname, but localStorage is
// origin-specific. During upgrades preserve an already established origin
// identity on conflict; never silently overwrite either stored ID.
const browserCookieStorage: WorkstationIdentityStorage = {
  getItem(key) {
    let cookie: string | null = null;
    try {
      cookie = readCookie(key);
    } catch {
      /* Browser may deny cookie access entirely. */
    }
    let mirror: string | null = null;
    try {
      mirror = window.localStorage.getItem(key);
    } catch {
      /* Cookie may remain available. */
    }
    if (isValidWorkstationId(mirror) && isValidWorkstationId(cookie) &&
        mirror.trim().toLowerCase() !== cookie.trim().toLowerCase()) {
      // Preserve the workstation used on this *origin* before an upgrade.
      // The different cookie is not rewritten, and no new workstation is created.
      // Administrators can inspect the conflict and schedule reconciliation.
      return mirror;
    }
    if (isValidWorkstationId(cookie)) {
      try {
        window.localStorage.setItem(key, cookie);
      } catch {
        /* Cookie remains canonical. */
      }
      return cookie;
    }
    if (isValidWorkstationId(mirror)) {
      try {
        writeCookie(key, mirror);
      } catch {
        /* The mirror remains persistent. */
      }
      return mirror;
    }
    return null;
  },
  setItem(key, value) {
    try {
      writeCookie(key, value);
    } catch {
      /* Try the independent mirror below. */
    }
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* Cookie may still persist. */
    }
  },
};

function getBrowserStorage() {
  if (typeof window === "undefined") return null;
  return typeof document === "undefined" ? inMemoryStorage : browserCookieStorage;
}

export function getCurrentWorkstationId() {
  const storage = getBrowserStorage();
  if (!storage) return null;
  // Existing origin identity wins over a conflicting cross-port cookie.
  // No third UUID is generated, and the server remains authoritative for
  // whether this device may operate on the current attendance.
  if (cachedWorkstationId) {
    // Detect deleted/rotated storage while this tab is still open. An old
    // cached UUID must not keep authorizing a workstation that lost identity.
    const persisted = storage.getItem(WORKSTATION_ID_STORAGE_KEY);
    return persisted?.trim().toLowerCase() === cachedWorkstationId ? cachedWorkstationId : null;
  }
  const id = ensureWorkstationId(storage);
  // A volatile UUID would become a different station after reload. Fail clearly
  // instead of recording attendance against an identity that cannot be reused.
  if (
    typeof document !== "undefined" &&
    storage.getItem(WORKSTATION_ID_STORAGE_KEY)?.trim().toLowerCase() !== id
  )
    return null;
  cachedWorkstationId = id;
  return cachedWorkstationId;
}

export function resetWorkstationIdentityCacheForTests() {
  cachedWorkstationId = null;
  inMemoryWorkstationId = null;
}
