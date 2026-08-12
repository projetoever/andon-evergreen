import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const HASH_PREFIX = "scrypt";
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export type TechnicianCredentialMethod = "pin" | "rfid";

export type TechnicianCredential = {
  method: TechnicianCredentialMethod;
  value: string;
};

export function normalizePin(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^\d{4,8}$/.test(normalized) ? normalized : null;
}

export function normalizeTag(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length >= 4 && normalized.length <= 64 ? normalized : null;
}

export function normalizeCredential(method: unknown, value: unknown): TechnicianCredential | null {
  if (method === "pin") {
    const normalized = normalizePin(value);
    return normalized ? { method, value: normalized } : null;
  }

  if (method === "rfid") {
    const normalized = normalizeTag(value);
    return normalized ? { method, value: normalized } : null;
  }

  return null;
}

export async function hashCredential(value: string) {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scrypt(value, salt, KEY_BYTES)) as Buffer;
  return [HASH_PREFIX, salt.toString("hex"), derived.toString("hex")].join("$");
}

export async function verifyCredential(value: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  const [prefix, saltHex, expectedHex] = storedHash.split("$");
  if (prefix !== HASH_PREFIX || !saltHex || !expectedHex) return false;

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(expectedHex, "hex");
    const actual = (await scrypt(value, salt, expected.length)) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
