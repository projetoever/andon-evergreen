import { useCallback, useEffect, useState } from "react";
import { Building2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ui, systemMessage } from "@/i18n/translate";
import { getSystemSettings, updateSystemSettings } from "@/services/systemSettingsService";

type ClientIdentity = { clientName: string; clientUnit: string };

/** Admin-only editor, mounted inside the already protected Hub administration. */
export function HubClientIdentitySettings() {
  const [saved, setSaved] = useState<ClientIdentity | null>(null);
  const [draft, setDraft] = useState<ClientIdentity>({ clientName: "", clientUnit: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const settings = await getSystemSettings();
      const value = {
        clientName: settings.clientName ?? "Evergreen",
        clientUnit: settings.clientUnit ?? "",
      };
      setSaved(value);
      setDraft(value);
    } catch (cause) {
      setSaved(null);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a identificação do cliente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const validName = draft.clientName.trim().length >= 2 &&
    draft.clientName.trim().length <= 100;
  const validUnit = draft.clientUnit.trim().length <= 100;
  const changed = saved !== null && (
    draft.clientName.trim() !== saved.clientName ||
    draft.clientUnit.trim() !== saved.clientUnit
  );

  const save = async () => {
    if (!saved || saving || loading || !changed || !validName || !validUnit) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateSystemSettings({
        clientName: draft.clientName.trim(),
        clientUnit: draft.clientUnit.trim(),
      });
      const value = { clientName: result.clientName, clientUnit: result.clientUnit };
      setSaved(value);
      setDraft(value);
      setMessage(ui("Identificação do cliente salva."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a identificação do cliente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label={ui("Identificação da empresa e unidade")}
      className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold">
            <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
            {ui("Empresa e unidade")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {ui("Dados exibidos na identificação do Hub e nos relatórios executivos do BI.")}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading || saving || changed}
          onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {ui("Recarregar")}
        </Button>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="text-muted-foreground">{ui("Nome da empresa")}</span>
          <input className="h-10 min-w-0 rounded-md border border-border bg-background px-3 text-foreground"
            value={draft.clientName} disabled={loading || saving || !saved} maxLength={100}
            onChange={(event) => setDraft((current) => ({ ...current, clientName: event.target.value }))} />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="text-muted-foreground">{ui("Unidade / planta")}</span>
          <input className="h-10 min-w-0 rounded-md border border-border bg-background px-3 text-foreground"
            value={draft.clientUnit} disabled={loading || saving || !saved} maxLength={100}
            placeholder={ui("Opcional")}
            onChange={(event) => setDraft((current) => ({ ...current, clientUnit: event.target.value }))} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{systemMessage(error)}</p>}
      {message && <p role="status" className="text-sm text-success">{message}</p>}
      {loading && <p role="status" className="text-xs text-muted-foreground">{ui("Carregando identificação do cliente...")}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {changed ? ui("Alterações não salvas") : ui("Identificação sincronizada")}
        </span>
        <Button type="button" size="sm" disabled={!saved || loading || saving || !changed || !validName || !validUnit}
          onClick={() => void save()}>
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          {ui(saving ? "Salvando..." : "Salvar identificação")}
        </Button>
      </div>
    </section>
  );
}
