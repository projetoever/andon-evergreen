import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ui, systemMessage } from "@/i18n/translate";
import { accessRequest } from "@/services/accessService";

type ServiceScope = "machines.read" | "calls.read" | "sound.read";
const SCOPES: { value: ServiceScope; label: string }[] = [
  { value: "machines.read", label: "Máquinas: leitura" },
  { value: "calls.read", label: "Chamados: leitura" },
  { value: "sound.read", label: "Sinalização: leitura" },
];

type Identity = {
  id: string;
  name: string;
  active: boolean;
  scopes: string[];
  secretVersion: number;
  secretExpiresAt: string;
  revokedAt?: string | null;
};
type Issued = Identity & { clientId: string; clientSecret: string };

/** Admin-only presentation of the existing read-only industrial service API.
 * Server remains authoritative (step-up, HTTPS, workstation, ACL, audit).
 * Never store tokens in browser storage or log them.
 */
export function ServiceIdentitiesSettings() {
  const [services, setServices] = useState<Identity[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ServiceScope[]>([]);
  const [days, setDays] = useState(90);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [requiresReauth, setRequiresReauth] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

  const load = useCallback(async () => {
    const result = await accessRequest<Identity[]>("/service-identities");
    setServices(result);
  }, []);
  useEffect(() => {
    let active = true;
    void accessRequest<Identity[]>("/service-identities")
      .then((data) => { if (active) setServices(data); })
      .catch((err: unknown) => {
        if (!active) return;
        const code = err instanceof Error ? err.message : "access_unavailable";
        setError(code);
        if (code === "reauthentication_required") setRequiresReauth(true);
      });
    return () => { active = false; };
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setIssued(null);
    try {
      await action();
      await load();
    } catch (err) {
      const code = err instanceof Error ? err.message : "access_unavailable";
      setError(code);
      if (code === "reauthentication_required") setRequiresReauth(true);
    } finally {
      setBusy(false);
    }
  }

  function choosePreset(kind: "node-red" | "gpio") {
    setName(kind === "node-red" ? "Node-RED — homologação" : "Mini PC GPIO — homologação");
    // The GPIO preset gets the least scope necessary to read machine/sound
    // state; operators can explicitly opt in to calls.read if needed.
    setScopes(kind === "node-red"
      ? ["machines.read", "calls.read", "sound.read"]
      : ["machines.read", "sound.read"]);
    setReason("Homologação isolada no notebook");
  }

  const validForm = name.trim().length > 0 && scopes.length > 0 &&
    reason.trim().length > 0 && Number.isInteger(days) && days >= 1 && days <= 365;

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validForm) return;
    await run(async () => {
      const secret = await accessRequest<Issued>("/service-identities", "POST", {
        name: name.trim(), scopes, credentialTtlDays: days, reason: reason.trim(),
      });
      setIssued(secret);
      setName("");
      setScopes([]);
      setReason("");
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4 md:p-5">
        <h2 className="text-lg font-bold">{ui("Integrações API industriais")}</h2>
        <p className="text-sm text-muted-foreground">{ui(
          "Credenciais específicas para Node-RED e mini PC GPIO. Esta tela não configura nem conecta equipamentos automaticamente."
        )}</p>
        <p className="text-sm text-muted-foreground">{ui(
          "Escopos disponíveis: leitura de máquinas, chamados e sinalização. Nenhuma escrita em máquina, chamado ou administração é concedida."
        )}</p>
        <p className="text-sm font-semibold">{ui("Somente testar com dados fictícios e HTTPS no notebook; não utilizar credenciais da fábrica.")}</p>
      </Card>
      {error && <Card role="alert" className="border-danger p-4 text-sm text-danger">
        {systemMessage(error)}
      </Card>}
      {requiresReauth && (
        <Card className="space-y-3 p-4">
          <h3 className="font-bold">{ui("Confirmação da senha Admin central")}</h3>
          <p className="text-sm text-muted-foreground">{ui(
            "É a mesma senha do Hub, solicitada novamente apenas para uma operação sensível."
          )}</p>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            void accessRequest("/reauthenticate", "POST", { password: adminPassword })
              .then(async () => {
                setRequiresReauth(false);
                setAdminPassword("");
                await load();
              })
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "access_unavailable"))
              .finally(() => setBusy(false));
          }}>
            <Input aria-label={ui("Senha Admin central")} type="password"
              autoComplete="current-password" maxLength={128} required
              value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
              className="max-w-sm" />
            <Button disabled={busy} type="submit">{ui("Confirmar senha")}</Button>
          </form>
        </Card>
      )}
      {issued && (
        <Card role="status" className="space-y-3 border-warning/60 p-4">
          <h3 className="font-bold">{ui("Credencial emitida — exibição única")}</h3>
          <p className="text-sm">{ui("Guarde os valores num cofre seguro. O segredo não será exibido novamente.")}</p>
          <Label className="block space-y-1">
            <span>{"clientId"}</span>
            <code className="block select-all break-all rounded bg-muted p-3">{issued.clientId}</code>
          </Label>
          <Label className="block space-y-1">
            <span>{"clientSecret"}</span>
            <code className="block select-all break-all rounded bg-muted p-3">{issued.clientSecret}</code>
          </Label>
          <Button type="button" variant="outline" onClick={() => setIssued(null)}>
            {ui("Já guardei, ocultar segredo")}
          </Button>
        </Card>
      )}
      <Card className="space-y-4 p-4 md:p-5">
        <h3 className="font-bold">{ui("Emitir credencial de teste")}</h3>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => choosePreset("node-red")} disabled={busy}>
            {"Node-RED"}
          </Button>
          <Button type="button" variant="outline" onClick={() => choosePreset("gpio")} disabled={busy}>
            {"Mini PC GPIO"}
          </Button>
        </div>
        <form onSubmit={(e) => void create(e)} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Label className="space-y-1">{ui("Nome da integração")}
              <Input required maxLength={120} value={name}
                onChange={(e) => setName(e.target.value)} />
            </Label>
            <Label className="space-y-1">{ui("Validade do segredo (dias)")}
              <Input required type="number" min={1} max={365} value={days}
                onChange={(e) => setDays(Number(e.target.value))} />
            </Label>
          </div>
          <fieldset className="space-y-2">
            <legend className="font-semibold">{ui("Permissões técnicas de leitura")}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {SCOPES.map((scope) => (
                <Label key={scope.value} className="flex min-h-11 items-center gap-2 rounded-md border p-3">
                  <input type="checkbox" checked={scopes.includes(scope.value)}
                    onChange={(e) => setScopes((prev) =>
                      e.target.checked ? [...prev.filter((s) => s !== scope.value), scope.value]
                        : prev.filter((s) => s !== scope.value))} />
                  {ui(scope.label)}
                </Label>
              ))}
            </div>
          </fieldset>
          <Label className="block space-y-1">{ui("Justificativa auditável")}
            <Input required maxLength={500} value={reason}
              onChange={(e) => setReason(e.target.value)} />
          </Label>
          <Button type="submit" disabled={busy || !validForm}>{ui("Gerar credencial técnica")}</Button>
        </form>
      </Card>
      <Card className="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">{ui("Credenciais cadastradas")}</h3>
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => {})}>
            {ui("Atualizar lista")}
          </Button>
        </div>
        {services.length === 0 && <p className="text-sm text-muted-foreground">{ui("Nenhuma integração cadastrada.")}</p>}
        {services.map((service) => (
          <div key={service.id} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{service.name}</p>
                <p className="break-all text-xs text-muted-foreground">{ui("ID")}: {service.id}</p>
                <p className="text-xs text-muted-foreground">
                  {service.scopes.join(" · ")} · {ui("Validade")}: {service.secretExpiresAt.slice(0, 10)}
                </p>
              </div>
              <span className="text-sm font-semibold">{ui(service.active ? "Ativa" : "Revogada")}</span>
            </div>
            {service.active && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={busy || !reason.trim()}
                  onClick={() => void run(async () => {
                    const next = await accessRequest<Issued>(
                      `/service-identities/${encodeURIComponent(service.id)}/rotate`, "POST",
                      { credentialTtlDays: days, reason: reason.trim() },
                    );
                    setIssued(next);
                  })}>{ui("Rotacionar segredo")}</Button>
                {confirmRevoke === service.id ? (
                  <Button variant="destructive" size="sm" disabled={busy || !reason.trim()}
                    onClick={() => void run(async () => {
                      await accessRequest(
                        `/service-identities/${encodeURIComponent(service.id)}/revoke`,
                        "POST", { reason: reason.trim() },
                      );
                      setConfirmRevoke(null);
                    })}>{ui("Confirmar revogação")}</Button>
                ) : (
                  <Button variant="outline" size="sm" disabled={busy}
                    onClick={() => setConfirmRevoke(service.id)}>{ui("Revogar acesso")}</Button>
                )}
                {confirmRevoke === service.id && (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRevoke(null)}>
                    {ui("Cancelar")}
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{ui(
          "Para rotacionar ou revogar, informe uma justificativa no formulário acima. Nenhum cliente físico é reconfigurado automaticamente."
        )}</p>
      </Card>
    </div>
  );
}
