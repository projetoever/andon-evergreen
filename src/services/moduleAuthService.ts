import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import type { ModuleCredentialSettings, PasswordModule } from "@/types/modules";
import { clearModuleSession, writeModuleSession, type ModuleSession } from "./moduleSessionStorage";

const api = createAndonApiClient();
// Explicit local development only; never a fallback for production credentials.
const localCredentials: Partial<
  Record<PasswordModule, { username: string; password: string; passwordRequired: boolean }>
> = {};
export function localModulePolicy(module: PasswordModule): ModuleCredentialSettings {
  const config = localCredentials[module];
  return {
    id: module,
    username: config?.username ?? null,
    configured: Boolean(config?.password),
    passwordRequired: config?.passwordRequired ?? false,
  };
}
export async function getModuleCredentials(): Promise<ModuleCredentialSettings[]> {
  if (CONFIGURED_DATA_MODE === "local")
    return [localModulePolicy("operational"), localModulePolicy("bi")];
  return api.get("/api/modules/credentials");
}
export async function saveModuleCredentials(
  module: PasswordModule,
  settings: { username: string; password?: string; passwordRequired: boolean },
): Promise<ModuleCredentialSettings> {
  let saved: ModuleCredentialSettings;
  if (CONFIGURED_DATA_MODE === "local") {
    const password = settings.password || localCredentials[module]?.password || "";
    if (settings.passwordRequired && (!settings.username.trim() || password.trim().length < 6))
      throw new Error("Configure usuário e senha antes de exigir autenticação.");
    localCredentials[module] = { ...settings, password };
    saved = localModulePolicy(module);
  } else
    saved = await api.request(`/api/modules/${module}/credentials`, {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  clearModuleSession(module);
  return saved;
}
export async function loginModule(module: PasswordModule, username: string, password: string) {
  let session: ModuleSession;
  if (CONFIGURED_DATA_MODE === "local") {
    const config = localCredentials[module];
    if (
      !config ||
      username.trim() !== config.username ||
      password.trim() !== config.password.trim()
    )
      throw new Error("Usuário ou senha inválidos.");
    session = {
      token: "local",
      username: config.username,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    };
  } else session = await api.post(`/api/modules/${module}/login`, { username, password });
  writeModuleSession(module, session);
}
export async function logoutModule(module: PasswordModule) {
  try {
    if (CONFIGURED_DATA_MODE === "api") await api.post(`/api/modules/${module}/logout`, {});
  } finally {
    clearModuleSession(module);
  }
}
