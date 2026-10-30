import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { AccessError } from "./policy.js";
import { verifyCredential } from "../security/technicianCredentials.js";
let activeHashes = 0;
const waiters: Array<() => void> = [];
async function derive(password: string, salt: string) {
  if (activeHashes < 2) activeHashes++;
  else {
    if (waiters.length >= 8) throw new AccessError("authentication_busy", 429);
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scryptCallback(
        password,
        salt,
        64,
        { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      ),
    );
  } finally {
    const next = waiters.shift();
    if (next) next();
    else activeHashes--;
  }
}
export function normalizeLogin(value: string) {
  const login = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(login)) throw new Error("invalid_login");
  return login;
}
export const MIN_PERSONAL_PASSWORD_LENGTH = 8;
export const MAX_PERSONAL_PASSWORD_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "123456789012345",
  "password", "password123", "passwordpassword", "senha123",
  "senha1234", "senha12345678901", "admin123", "admin1234",
  "qwerty123", "qwertyuiop", "abcdefgh", "11111111", "00000000",
]);

export function validatePersonalPassword(password: string) {
  const length = [...password].length;
  // No external lookup: reject known weak values and single-character repeats.
  // Longer passphrases are recommended, but 8 chars is the accepted minimum.
  if (
    length < MIN_PERSONAL_PASSWORD_LENGTH ||
    length > MAX_PERSONAL_PASSWORD_LENGTH ||
    COMMON_PASSWORDS.has(password.toLowerCase()) ||
    /^(.)\1{7,}$/s.test(password)
  ) {
    throw new Error("password_policy_failed");
  }
}
export function temporaryPassword() {
  // 20 hex characters, 80 random bits, without mixed-case/letter-digit ambiguity.
  return randomBytes(10).toString("hex");
}
export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function csrfToken(token: string) {
  return tokenHash(`andon-csrf:${token}`);
}
export function checkCsrf(token: string, supplied: unknown) {
  if (typeof supplied !== "string" || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(csrfToken(token), "hex"), Buffer.from(supplied, "hex"));
}
export async function hashAccessPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `andon-scrypt-v1$${salt}$${key.toString("hex")}`;
}
export async function verifyAccessPassword(password: string, stored: string) {
  if (stored.startsWith("scrypt$")) return verifyCredential(password, stored);
  const parts = stored.split("$");
  if (
    parts.length !== 3 ||
    parts[0] !== "andon-scrypt-v1" ||
    !/^[a-f0-9]{32}$/.test(parts[1]) ||
    !/^[a-f0-9]{128}$/.test(parts[2])
  )
    return false;
  const key = await derive(password, parts[1]);
  return timingSafeEqual(key, Buffer.from(parts[2], "hex"));
}
