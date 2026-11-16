import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminSettingsWorkspace } from "@/components/settings/AdminSettingsModal";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { accessRequest, type AccessState } from "@/services/accessService";
import { isAdminAuthenticated } from "@/services/adminAuthService";
import { ui } from "@/i18n/translate";

/** Route-owned fullscreen config: direct links never bypass Hub permissions. */
export function AndonAdminPage() {
  const navigate = useNavigate();
  const { access, checking, error } = useModuleAccess();
  const [authorization, setAuthorization] = useState<"checking" | "allowed" | "denied">("checking");
  const authorizationRequest = useRef(0);
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);
  const isCentral = access?.centralAccessEnabled === true;

  const verifyAccess = useCallback(async () => {
    const requestId = ++authorizationRequest.current;
    if (checking || !access) {
      setAuthorization("checking");
      return;
    }
    if (error) {
      setAuthorization("denied");
      return;
    }
    if (!isCentral) {
      setAuthorization(isAdminAuthenticated() ? "allowed" : "denied");
      setIsPrimaryAdmin(false);
      return;
    }
    // Verify a live central HttpOnly session on the API. Module visibility is
    // not a substitute for the server-owned user permissions.
    try {
      const session = await accessRequest<AccessState>("/session");
      if (requestId !== authorizationRequest.current) return;
      const principal = session.principal;
      const allowed = principal?.purpose === "normal" &&
        (principal.isPrimaryAdmin === true ||
          principal.permissions?.includes("andon.settings.open") === true);
      setIsPrimaryAdmin(principal?.isPrimaryAdmin === true);
      setAuthorization(allowed ? "allowed" : "denied");
    } catch {
      if (requestId !== authorizationRequest.current) return;
      setAuthorization("denied");
    }
  }, [checking, access, error, isCentral]);

  useEffect(() => {
    void verifyAccess();
    const revalidate = () => { void verifyAccess(); };
    window.addEventListener("focus", revalidate);
    window.addEventListener("andon:module-session-changed", revalidate);
    const interval = window.setInterval(revalidate, 30_000);
    return () => {
      authorizationRequest.current += 1;
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("andon:module-session-changed", revalidate);
      window.clearInterval(interval);
    };
  }, [verifyAccess]);

  if (checking || !access || error || authorization !== "allowed") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-4">
        <section className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-card p-6"
          role={error || authorization === "denied" ? "alert" : "status"}>
          <ShieldCheck className="h-7 w-7 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-bold">{ui("Administração do ANDON")}</h1>
          <p className="text-sm text-muted-foreground">
            {checking || (authorization === "checking" && !error)
              ? ui("Verificando autorização da workstation e do usuário...")
              : ui("Acesso não autorizado. Entre pelo Hub ou solicite a permissão Config. ANDON.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/andon"><ArrowLeft className="mr-2 h-4 w-4" />{ui("Voltar ao ANDON")}</Link>
            </Button>
            <Button variant="outline" asChild><Link to="/hub">{ui("Abrir Hub")}</Link></Button>
            {authorization === "denied" && <Button onClick={() => void verifyAccess()}>
              {ui("Verificar novamente")}
            </Button>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <AdminSettingsWorkspace
      centralAccess={isCentral}
      centralPrimaryAdmin={isPrimaryAdmin}
      onClose={() => void navigate({ to: "/andon" })}
    />
  );
}
