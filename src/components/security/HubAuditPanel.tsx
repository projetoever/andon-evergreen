import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accessRequest } from "@/services/accessService";
import { getInterfaceLocale, systemMessage, ui } from "@/i18n/translate";
import { withHubTransientRetry } from "@/services/hubTransitionRetry";
import { DEFAULT_ANDON_API_CLIENT_CONFIG } from "@/api/andonApiClient";
import { getCurrentWorkstationId } from "@/services/workstationIdentityService";

type AuditEvent = {
  id: string;
  occurredAt: string;
  actorType: string;
  actorLogin: string | null;
  actorName: string | null;
  actorRole: string | null;
  workstationId: string | null;
  ipAddress: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  machineId: string | null;
  result: "success" | "denied" | "failure";
  reason: string | null;
  before: unknown;
  after: unknown;
};
type AuditPage = { rows: AuditEvent[]; total: number; page: number; pageSize: number };
type AuditFilters = { search: string; actor: string; action: string; from: string; to: string };
const emptyFilters: AuditFilters = { search: "", actor: "", action: "", from: "", to: "" };
export function auditQuery(filters: AuditFilters, page?: number): string {
  const params = new URLSearchParams();
  for (const key of ["search", "actor", "action", "from", "to"] as const)
    if (filters[key].trim()) params.set(key, filters[key].trim());
  if (page !== undefined) params.set("page", String(page));
  return params.toString();
}

async function downloadAuditCsv(query: string): Promise<void> {
  // GET-only download. The browser sends the same HttpOnly central cookie;
  // the API checks BOTH read and export permission on every request.
  const base = DEFAULT_ANDON_API_CLIENT_CONFIG.baseUrl;
  if (window.location.protocol !== "https:" || !base.startsWith("https://"))
    throw new Error("https_required");
  const response = await fetch(`${base}/api/access/audit-events/export?${query}`, {
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
    headers: {
      "X-Andon-Workstation-Id": getCurrentWorkstationId() ?? "",
      "Accept": "text/csv",
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "access_unavailable" })) as { error?: string };
    throw new Error(body.error ?? "access_unavailable");
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `andon-auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function resultLabel(result: AuditEvent["result"]): string {
  return ui(result === "success" ? "Concluído" : result === "denied" ? "Negado" : "Falha");
}
function eventLabel(action: string): string {
  switch (action) {
    case "ui.route.view": return ui("Acesso à tela");
    case "ui.click": return ui("Clique na interface");
    case "audit.view": return ui("Consulta à auditoria");
    case "audit.export": return ui("Exportação de auditoria");
    default: return action;
  }
}

export function HubAuditPanel({ open, onOpenChange, canExport }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canExport: boolean;
}) {
  const [draft, setDraft] = useState<AuditFilters>(emptyFilters);
  const [applied, setApplied] = useState<AuditFilters>(emptyFilters);
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const query = useMemo(() => auditQuery(applied, page), [applied, page]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    void withHubTransientRetry(() =>
      accessRequest<AuditPage>(`/audit-events?${query}`),
    ).then((result) => {
      if (active) setData(result);
    }).catch((cause) => {
      if (!active) return;
      setData(null); // Never display rows after a permission failure.
      setError(cause instanceof Error ? cause.message : "access_unavailable");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, query, reload]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setApplied({ ...draft });
  }

  async function exportCsv() {
    if (exporting || !canExport) return;
    setExporting(true);
    setError("");
    try {
      await downloadAuditCsv(auditQuery(applied));
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "access_unavailable";
      setError(code === "audit_export_limit"
        ? ui("O período contém mais de 20.000 eventos. Filtre por datas e exporte em partes.")
        : code);
    } finally {
      setExporting(false);
    }
  }
  const lastPage = data ? Math.max(0, Math.ceil(data.total / data.pageSize) - 1) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] w-[96vw] max-w-7xl flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <div className="flex shrink-0 items-start gap-3 pr-8">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <DialogTitle>{ui("Central de auditoria")}</DialogTitle>
            <DialogDescription>
              {ui("Registros de acesso, cliques identificáveis, alterações e decisões de segurança. Eventos de interface são informativos; mudanças confirmadas são registradas pelo servidor.")}
            </DialogDescription>
          </div>
        </div>

        <form className="grid shrink-0 gap-2 md:grid-cols-6" onSubmit={applyFilters}>
          <Input value={draft.search} onChange={event => setDraft({ ...draft, search: event.target.value })}
            placeholder={ui("Pesquisar evento ou recurso")} aria-label={ui("Pesquisar evento ou recurso")} maxLength={120}
            className="md:col-span-2" />
          <Input value={draft.actor} onChange={event => setDraft({ ...draft, actor: event.target.value })}
            placeholder={ui("Usuário ou responsável")} aria-label={ui("Usuário ou responsável")} maxLength={100} />
          <Input value={draft.action} onChange={event => setDraft({ ...draft, action: event.target.value })}
            placeholder={ui("Tipo de ação")} aria-label={ui("Tipo de ação")} maxLength={100} />
          <Input type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })}
            aria-label={ui("Data inicial (UTC)")} />
          <Input type="date" value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })}
            aria-label={ui("Data final (UTC)")} />
          <div className="flex flex-wrap items-center gap-2 md:col-span-6">
            <Button type="submit" variant="default"><Search className="mr-2 h-4 w-4" />{ui("Filtrar")}</Button>
            <Button type="button" variant="outline" onClick={() => {
              setDraft(emptyFilters); setApplied(emptyFilters); setPage(0); setReload(value => value + 1);
            }}>{ui("Limpar filtros")}</Button>
            <Button type="button" variant="outline" disabled={loading}
              onClick={() => setReload(value => value + 1)}>
              <RefreshCw className="mr-2 h-4 w-4" />{ui("Atualizar")}
            </Button>
            {canExport && (
              <Button type="button" variant="outline" disabled={exporting}
                onClick={() => void exportCsv()}>
                <Download className="mr-2 h-4 w-4" />
                {exporting ? ui("Preparando CSV...") : ui("Exportar CSV")}
              </Button>
            )}
            <span className="ml-auto text-sm text-muted-foreground" role="status">
              {data ? ui("{0} registros encontrados", { 0: data.total }) : ui("Consultando registros...")}
            </span>
          </div>
        </form>

        {error && <p role="alert" className="shrink-0 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {systemMessage(error)}
        </p>}
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border" aria-busy={loading}>
          {loading && !data ? (
            <p role="status" className="p-5 text-sm text-muted-foreground">{ui("Carregando auditoria...")}</p>
          ) : data?.rows.length ? (
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-3 font-bold">{ui("Data e hora")}</th>
                  <th className="p-3 font-bold">{ui("Usuário")}</th>
                  <th className="p-3 font-bold">{ui("Ação")}</th>
                  <th className="p-3 font-bold">{ui("Recurso")}</th>
                  <th className="p-3 font-bold">{ui("Resultado")}</th>
                  <th className="p-3 font-bold">{ui("Detalhes")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(item => (
                  <tr key={item.id} className="border-b border-border/70 align-top last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap p-3 tabular-nums">{new Date(item.occurredAt).toLocaleString(getInterfaceLocale())}</td>
                    <td className="max-w-48 break-words p-3">
                      <div className="font-semibold">{item.actorName || item.actorLogin || ui("Não identificado")}</div>
                      <div className="text-xs text-muted-foreground">{item.actorLogin || item.actorType}</div>
                    </td>
                    <td className="p-3"><div className="font-semibold">{eventLabel(item.action)}</div>
                      <code className="break-all text-xs text-muted-foreground">{item.action}</code>
                    </td>
                    <td className="max-w-56 break-all p-3">
                      <div>{item.resourceType}{item.resourceId ? ` · ${item.resourceId}` : ""}</div>
                      {item.machineId && <div className="text-xs text-muted-foreground">{ui("Máquina")}: {item.machineId}</div>}
                    </td>
                    <td className="p-3"><span className={item.result === "success" ? "text-success" : "text-warning"}>{resultLabel(item.result)}</span></td>
                    <td className="p-3">
                      <details>
                        <summary className="cursor-pointer font-semibold text-primary">{ui("Ver detalhes")}</summary>
                        <div className="mt-2 max-w-md space-y-1 text-xs">
                          {item.workstationId && <p className="break-all">{ui("Workstation")}: {item.workstationId}</p>}
                          {item.ipAddress && <p>IP: {item.ipAddress}</p>}
                          {item.reason && <p className="break-words">{ui("Motivo")}: {item.reason}</p>}
                          <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
                            {JSON.stringify({ before: item.before, after: item.after }, null, 2)}
                          </pre>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : !error && (
            <p role="status" className="p-5 text-sm text-muted-foreground">{ui("Nenhum registro para os filtros selecionados.")}</p>
          )}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {ui("Dados persistidos no servidor; horários exibidos no fuso do dispositivo. Períodos filtrados em UTC.")}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={loading || page === 0}
              onClick={() => setPage(value => Math.max(0, value - 1))}>{ui("Anterior")}</Button>
            <span className="whitespace-nowrap tabular-nums">{ui("Página {0} de {1}", { 0: page + 1, 1: lastPage + 1 })}</span>
            <Button type="button" variant="outline" disabled={loading || page >= lastPage}
              onClick={() => setPage(value => value + 1)}>{ui("Próxima")}</Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
