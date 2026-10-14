import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import { getCurrentWorkstationId } from "@/services/workstationIdentityService";
import { getWorkstation, registerCurrentWorkstation } from "@/services/workstationService";
import { AndonApiError } from "@/api/andonApiClient";

type AccessState = "checking" | "allowed" | "blocked" | "unavailable";

/** UI gate only; API also enforces active=false on every identified request. */
export function WorkstationAccessGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccessState>(CONFIGURED_DATA_MODE === "local" ? "allowed" : "checking");
  const [detail, setDetail] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (CONFIGURED_DATA_MODE === "local") return;
    let disposed = false;
    let inFlight = false;

    const verify = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const workstationId = getCurrentWorkstationId();
        const workstation = status === "allowed" && workstationId
          ? await getWorkstation(workstationId)
          : await registerCurrentWorkstation();
        if (!disposed) {
          setStatus(workstation?.active ? "allowed" : "blocked");
          setDetail(null);
        }
      } catch (error) {
        if (!disposed) {
          if (error instanceof AndonApiError && error.status === 403) {
            setStatus("blocked");
          } else {
            setStatus("unavailable");
            setDetail(error instanceof Error ? error.message : "Não foi possível verificar o acesso.");
          }
        }
      } finally {
        inFlight = false;
      }
    };

    const onBlocked = () => {
      if (!disposed) {
        setStatus("blocked");
        setDetail(null);
      }
    };
    void verify();
    const timer = window.setInterval(() => void verify(), 30_000);
    window.addEventListener("andon:workstation-inactive", onBlocked);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("andon:workstation-inactive", onBlocked);
    };
  }, [revision, status]);

  if (status === "allowed") return <>{children}</>;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div role="alert" className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold">
          {status === "blocked" ? "Acesso ao ANDON bloqueado" : status === "checking" ? "Verificando workstation" : "Acesso ao ANDON indisponível"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {status === "blocked"
            ? "Esta workstation foi desativada no painel administrativo. Solicite ao administrador a reativação do acesso."
            : status === "checking"
              ? "Validando a identidade deste navegador com o servidor."
              : detail ?? "Não foi possível consultar o servidor."}
        </p>
        <p className="break-all font-mono text-xs text-muted-foreground">{getCurrentWorkstationId() ?? "Sem identidade"}</p>
        {status !== "checking" && (
          <Button type="button" variant="outline" onClick={() => { setStatus("checking"); setRevision((value) => value + 1); }}>
            Verificar novamente
          </Button>
        )}
      </div>
    </div>
  );
}
