import { ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  getWorkstationAdmissionPolicy,
  saveWorkstationAdmissionPolicy,
} from "@/services/hubEnrollmentService";
import { toast } from "@/i18n/toast";

export function WorkstationAdmissionSettings() {
  useInterfaceLanguage();
  const [required, setRequired] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    setRequired(null);
    setError(null);
    void getWorkstationAdmissionPolicy()
      .then((policy) => {
        if (!disposed) setRequired(policy.requireWorkstationApproval);
      })
      .catch((cause) => {
        if (!disposed)
          setError(
            cause instanceof Error ? cause.message : "Falha ao carregar a regra de aprovação.",
          );
      });
    return () => {
      disposed = true;
    };
  }, [attempt]);
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4">
      <label className="flex items-center justify-between gap-4 font-bold">
        {ui("Exigir aprovação para novas workstations")}
        <Switch
          aria-label={ui("Exigir aprovação para novas workstations")}
          checked={required === true}
          disabled={required === null || saving}
          onCheckedChange={async (next) => {
            setSaving(true);
            try {
              const saved = await saveWorkstationAdmissionPolicy(next);
              setRequired(saved.requireWorkstationApproval);
              toast.success("Regra de aprovação atualizada.");
            } catch (cause) {
              toast.error(cause instanceof Error ? cause.message : "Falha ao salvar a regra.");
            } finally {
              setSaving(false);
            }
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {ui(
          "A regra vale para novos registros. Quando ligada, aprove cada nova estação ativando seu acesso abaixo. Cadastros já aprovados mantêm suas permissões.",
        )}
      </p>
      <p className="text-xs text-warning">
        {ui(
          "Clientes de API sem UUID, incluindo Node-RED e GPIO, precisarão de identidade registrada e autorizada quando esta regra estiver ligada.",
        )}
      </p>
      {error && (
        <div role="alert" className="text-sm text-danger">
          {systemMessage(error)}{" "}
          <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
            {ui("Tentar novamente")}
          </Button>
        </div>
      )}
    </section>
  );
}
