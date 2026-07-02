const SESSION_KEY = "andonAdminSession";
const PASSWORD_KEY = "andonAdminPassword";
const ADMIN_USER = "admin";
const DEFAULT_ADMIN_PASSWORD = "123456";
export const ADMIN_PASSWORD_MIN_LENGTH = 6;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getAdminPassword() {
  if (!canUseStorage()) return DEFAULT_ADMIN_PASSWORD;

  const storedPassword = window.localStorage.getItem(PASSWORD_KEY)?.trim();
  return storedPassword && storedPassword.length >= ADMIN_PASSWORD_MIN_LENGTH ? storedPassword : DEFAULT_ADMIN_PASSWORD;
}

export function isValidAdminPasswordFormat(password: string) {
  return password.trim().length >= ADMIN_PASSWORD_MIN_LENGTH;
}

export function changeAdminPassword(currentPassword: string, newPassword: string) {
  if (currentPassword !== getAdminPassword()) {
    return { ok: false, message: "Senha atual inválida." };
  }

  const normalizedPassword = newPassword.trim();
  if (!isValidAdminPasswordFormat(normalizedPassword)) {
    return { ok: false, message: `A nova senha deve ter no mínimo ${ADMIN_PASSWORD_MIN_LENGTH} caracteres.` };
  }

  if (!canUseStorage()) {
    return { ok: false, message: "Não foi possível salvar a senha neste navegador." };
  }

  window.localStorage.setItem(PASSWORD_KEY, normalizedPassword);
  return { ok: true, message: "Senha administrativa alterada com sucesso." };
}

export function isAdminAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

export function loginAdmin(username: string, password: string) {
  const valid = username.trim() === ADMIN_USER && password === getAdminPassword();
  if (valid) {
    sessionStorage.setItem(SESSION_KEY, "true");
  }
  return valid;
}

export function logoutAdmin() {
  sessionStorage.removeItem(SESSION_KEY);
}
