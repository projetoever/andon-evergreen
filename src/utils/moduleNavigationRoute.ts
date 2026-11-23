import type { ModuleId } from "../types/modules";

/** Global History has its own server grant, not an operational module login.
 * Keep this route classifier independent of UI and browser state for testing.
 */
export type NavigationModuleId = ModuleId | "history";

export function navigationModuleForPath(pathname: string): NavigationModuleId {
  if (pathname === "/history" || pathname.startsWith("/history/")) return "history";
  if (pathname === "/bi" || pathname.startsWith("/bi/")) return "bi";
  if (pathname === "/machine-priorities") return "priorities";
  return "operational";
}
