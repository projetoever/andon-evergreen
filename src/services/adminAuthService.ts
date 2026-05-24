const SESSION_KEY = "andonAdminSession";
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "ever@123***";

export function isAdminAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

export function loginAdmin(username: string, password: string) {
  const valid = username === ADMIN_USER && password === ADMIN_PASSWORD;
  if (valid) {
    sessionStorage.setItem(SESSION_KEY, "true");
  }
  return valid;
}

export function logoutAdmin() {
  sessionStorage.removeItem(SESSION_KEY);
}
