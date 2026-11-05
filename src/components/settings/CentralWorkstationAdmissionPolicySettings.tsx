import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { accessRequest } from "@/services/accessService";
import { systemMessage, ui } from "@/i18n/translate";
import { toast } from "@/i18n/toast";

type Policy = { requireApproval: boolean; isolatedHmlDefault: boolean };

/** Admin-only UI; server-side primary Admin, CSRF, recent step-up and audit are authoritative. */
export function CentralWorkstationAdmissionPolicySettings() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [required, setRequired] = useState(true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    setError("");
    void accessRequest<Policy>("/workstations/admission-policy")
      .then((next) => {
        if (!alive) return;
        setPolicy(next);
        setRequired(next.requireApproval);
      })
      .catch((cause) => {
        if (alive) setError(cause instanceof Error ? systemMessage(cause.message) :
          ui("Não foi possível consultar a política de workstations."));
      });
    return () => { alive = false; };
  }, [revision]);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!policy || !reason.trim() || busy) return;
    setBusy(true);
    setError("");
    void accessRequest<Policy>("/workstations/admission-policy", "PATCH", {
      requireApproval: required, reason: reason.trim(),
    }).then((next) => {
      setPolicy(next);
      setReason("");
      toast.success("Regra de aprovação atualizada.");
    }).catch((cause) => {
      setError(cause instanceof Error ? systemMessage(cause.message) :
        ui("Não foi possível salvar a política de workstations."));
    }).finally(() => setBusy(false));
  };

  return (
    <section aria-label={ui("Admissão de novas workstations")}
      className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="font-bold">{ui("Admissão de novas workstations")}</h3>
      <p className="text-sm text-muted-foreground">
        {ui("Esta regra vale apenas para novos dispositivos. Workstations pendentes ou recusadas continuam bloqueadas até decisão explícita.")}
      </p>
      {policy?.isolatedHmlDefault && (
        <p className="text-sm text-warning">
          {ui("LAB isolado: novas workstations são liberadas por padrão para facilitar testes. Fora do LAB, a aprovação é obrigatória por padrão.")}
        </p>
      )}
      {error && <div role="alert" className="text-sm text-danger">{error}</div>}
      {!policy ? (
        <Button variant="outline" onClick={() => setRevision(n => n + 1)}>
          {ui("Tentar novamente")}
        </Button>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            {ui("Exigir aprovação administrativa para novas workstations")}
            <Switch aria-label={ui("Exigir aprovação administrativa para novas workstations")}
              disabled={busy} checked={required} onCheckedChange={setRequired} />
          </label>
          <label className="block space-y-2 text-sm font-semibold">
            <span>{ui("Justificativa auditável")}</span>
            <Input value={reason} maxLength={500} required
              onChange={e => setReason(e.target.value)}
              placeholder={ui("Ex.: Teste controlado de dispositivos no LAB")} />
          </label>
          <Button type="submit" disabled={busy || !reason.trim() || required === policy.requireApproval}>
            {ui("Salvar política de workstations")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {ui("Desativar a aprovação não dispensa login, autorização por perfil ou auditoria.")}
          </p>
        </form>
      )}
    </section>
  );
}
