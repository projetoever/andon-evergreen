/**
 * R10-08: advisory feedback while a personal password is typed.
 * The server implementation in server/src/access/credentials.ts remains the
 * authoritative gate. Never log, persist, hash or transmit input from here.
 */
export const COMMON_REJECTED_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "123456789012345",
  "password", "password123", "passwordpassword", "senha123",
  "senha1234", "senha12345678901", "admin123", "admin1234",
  "qwerty123", "qwertyuiop", "abcdefgh", "11111111", "00000000",
]);

export function personalPasswordHint(password: string): string | null {
  if (!password) return null;
  const length = [...password].length;
  if (length < 8) return "Use pelo menos 8 caracteres.";
  if (length > 128) return "Use no máximo 128 caracteres.";
  if (/^(.)\1{7,}$/s.test(password))
    return "Não repita o mesmo caractere em toda a senha.";
  if (COMMON_REJECTED_PASSWORDS.has(password.toLowerCase())) {
    if (/^\d+$/.test(password))
      return "Esta sequência numérica é muito previsível. Escolha uma senha diferente.";
    return "Esta senha é muito comum. Escolha uma combinação menos previsível.";
  }
  return null;
}
