import type { ModuleAccess, ModuleId } from "@/types/modules";

export type WorkstationGateDecision =
  | "checking"
  | "error"
  | "identity"
  | "denied"
  | "module-login"
  | "allowed";

/**
 * Only server-reported access can unlock a route. A missing central human
 * session always requires identification, even if a stale module flag says
 * allowed. Login never approves a workstation or grants a module.
 */
export function workstationGateDecision(
  access: ModuleAccess | null,
  module: ModuleId,
  checking: boolean,
  error: string | null,
): WorkstationGateDecision {
  if (checking || (!access && !error)) return "checking";
  if (!access) return "error";

  if (access.centralAccessEnabled === true &&
      access.principal?.purpose !== "normal") return "identity";

  const definition = access.modules.find((item) => item.id === module);
  if (!access.workstation.active ||
      !definition?.available || !definition.enabled || !definition.allowed)
    return "denied";

  if (module !== "priorities" &&
      definition.passwordRequired && !definition.authenticated)
    return "module-login";

  return "allowed";
}
