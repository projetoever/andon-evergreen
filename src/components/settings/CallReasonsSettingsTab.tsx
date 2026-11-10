import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/i18n/toast";
import { ui } from "@/i18n/translate";
import { useLanguage } from "@/i18n/LanguageProvider";
import { getSystemSettings } from "@/services/systemSettingsService";
import { getCategoryConfigs } from "@/services/categoryConfigService";
import type { AndonCategoryConfig } from "@/types/settings";
import {
  addCallReasonOption, createCallReason, getCallReasonsCatalog,
  updateCallReason, updateCallReasonOption,
  type CallReasonView, type CreateCallReason,
} from "@/services/callReasonsCatalogService";

const natures = [
  ["corrective_failure", "Manutenção corretiva"],
  ["planned_setup", "Setup programado"],
  ["production_support", "Apoio à produção"],
  ["unclassified", "Não classificado"],
] as const;
const policyValues = ["eligible", "excluded", "pending"] as const;
const policyNames = { eligible: "Elegível — sujeito a evidências", excluded: "Excluído do KPI corretivo", pending: "Pendente de classificação" };
const ID = /^[a-z0-9_]{2,40}$/;

function makeId(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0,40);
}

type Draft = CreateCallReason;
const emptyDraft = (): Draft => ({
  id: "", displayName: "", color: "#64748B", active: true, displayOrder: 10,
  nature: "unclassified", suggestedResponsibility: "unassigned",
  maintenanceKpiPolicy: "pending", analyticsDisposition: "include",
});

export function CallReasonsSettingsTab() {
  useLanguage();
  const [enabled, setEnabled] = useState(false);
  const [reasons, setReasons] = useState<CallReasonView[]>([]);
  const [areas, setAreas] = useState<AndonCategoryConfig[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [areaToAdd, setAreaToAdd] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = useMemo(() => reasons.find(reason => reason.id === selected) ?? null, [reasons, selected]);

  const refresh = useCallback(async (preferred?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const settings = await getSystemSettings();
      const allowed = settings.centralCallReasonsCatalogEnabled === true;
      setEnabled(allowed);
      if (!allowed) {
        setReasons([]);
        setAreas([]);
        return;
      }
      const [catalog, technicalAreas] = await Promise.all([
        getCallReasonsCatalog(), getCategoryConfigs(),
      ]);
      setReasons(catalog);
      setAreas(technicalAreas);
      const found = catalog.find(item => item.id === preferred) ?? catalog[0] ?? null;
      setSelected(found?.id ?? null);
      setDraft(found ? {
        id: found.id, displayName: found.displayName, color: found.color,
        active: found.active, displayOrder: found.displayOrder,
        nature: found.nature, suggestedResponsibility: found.suggestedResponsibility,
        maintenanceKpiPolicy: found.maintenanceKpiPolicy,
        analyticsDisposition: found.analyticsDisposition,
      } : emptyDraft());
    } catch (err) {
      setError(err instanceof Error ? err.message : ui("Erro ao carregar motivos de chamados."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  function edit(reason: CallReasonView) {
    setSelected(reason.id);
    setAreaToAdd("");
    setDraft({
      id: reason.id, displayName: reason.displayName, color: reason.color,
      active: reason.active, displayOrder: reason.displayOrder,
      nature: reason.nature, suggestedResponsibility: reason.suggestedResponsibility,
      maintenanceKpiPolicy: reason.maintenanceKpiPolicy,
      analyticsDisposition: reason.analyticsDisposition,
    });
  }

  async function saveReason() {
    if (busy) return;
    const next: Draft = {
      ...draft,
      id: selected ?? makeId(draft.displayName),
      displayName: draft.displayName.trim(),
      suggestedResponsibility: draft.nature === "corrective_failure" ? "maintenance"
        : draft.nature === "planned_setup" || draft.nature === "production_support" ? "operations"
          : "unassigned",
      maintenanceKpiPolicy: draft.nature !== "corrective_failure" &&
        draft.maintenanceKpiPolicy === "eligible" ? "excluded" : draft.maintenanceKpiPolicy,
    };
    if (!ID.test(next.id) || !next.displayName) {
      toast.error(ui("Informe um nome e identificador válido para o motivo."));
      return;
    }
    setBusy(true);
    try {
      if (chosen) {
        const { id: _id, ...values } = next;
        await updateCallReason(chosen.id, chosen.revision, values);
      } else {
        await createCallReason(next);
      }
      await refresh(next.id);
      toast.success(ui("Motivo de chamado salvo."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ui("Não foi possível salvar o motivo."));
    } finally { setBusy(false); }
  }

  async function addArea() {
    if (!chosen || !areaToAdd || busy) return;
    const area = areas.find(item => item.id === areaToAdd);
    if (!area?.active) return;
    setBusy(true);
    try {
      await addCallReasonOption(chosen.id, {
        id: makeId(chosen.id + "_" + area.id),
        technicalAreaId: area.id,
        active: true,
        displayOrder: chosen.options.length * 10 + 10,
      });
      await refresh(chosen.id);
      setAreaToAdd("");
      toast.success(ui("Especialidade vinculada ao motivo."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ui("Não foi possível vincular a especialidade."));
    } finally { setBusy(false); }
  }

  async function toggleArea(optionId: string, revision: number, active: boolean) {
    if (!chosen || busy) return;
    setBusy(true);
    try {
      await updateCallReasonOption(chosen.id, optionId, revision, { active });
      await refresh(chosen.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ui("Não foi possível alterar a especialidade."));
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-bold">{ui("Motivos e subcategorias de chamados")}</h2>
        <p className="text-sm text-muted-foreground">
          {ui("Configure o motivo principal e as especialidades que poderão aparecer na abertura de chamados. Este cadastro ainda não altera os botões operacionais nem os KPIs atuais.")}
        </p>
      </header>
      {loading && <p role="status">{ui("Carregando motivos...")}</p>}
      {!loading && !enabled && (
        <div className="rounded-lg border border-warning/50 bg-card p-4" role="status">
          <p className="font-semibold">{ui("Catálogo em homologação — edição indisponível")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {ui("A API de motivos ainda está desabilitada neste ambiente. Nenhuma configuração operacional foi alterada.")}
          </p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!loading && enabled && !error && (
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.4fr)]">
          <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label={ui("Motivos cadastrados")}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{ui("Motivos cadastrados")}</h3>
              <Button type="button" variant="outline" size="sm"
                onClick={() => { setSelected(null); setDraft(emptyDraft()); setAreaToAdd(""); }}>
                {ui("Novo motivo")}
              </Button>
            </div>
            {reasons.length === 0 && <p className="text-sm text-muted-foreground">{ui("Nenhum motivo cadastrado.")}</p>}
            {reasons.map(reason => (
              <button type="button" key={reason.id}
                onClick={() => edit(reason)}
                aria-pressed={selected === reason.id}
                className={"flex w-full items-center gap-2 rounded-lg border px-3 py-3 text-left " +
                  (selected === reason.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40")}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: reason.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{reason.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {ui(reason.nature)} · {reason.options.length} {ui("especialidades")}
                  </span>
                </span>
              </button>
            ))}
          </section>
          <section className="space-y-4 rounded-xl border border-border bg-card p-4" aria-label={ui("Editar motivo")}>
            <h3 className="font-semibold">{ui(chosen ? "Editar motivo" : "Criar motivo")}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Label className="block space-y-2">{ui("Nome do motivo")}
                <Input value={draft.displayName} maxLength={80} disabled={busy}
                  onChange={e => setDraft({ ...draft, displayName: e.target.value })} />
              </Label>
              <Label className="block space-y-2">{ui("Natureza do chamado")}
                <select className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={draft.nature} disabled={busy}
                  onChange={e => setDraft({
                    ...draft, nature: e.target.value as Draft["nature"],
                    maintenanceKpiPolicy: e.target.value === "corrective_failure" ? "pending" : "excluded",
                  })}>
                  {natures.map(([value, title]) => <option key={value} value={value}>{ui(title)}</option>)}
                </select>
              </Label>
              <Label className="block space-y-2">{ui("Política de KPI corretivo")}
                <select className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={draft.maintenanceKpiPolicy} disabled={busy}
                  onChange={e => setDraft({ ...draft, maintenanceKpiPolicy: e.target.value as Draft["maintenanceKpiPolicy"] })}>
                  {policyValues.filter(value => value !== "eligible" || draft.nature === "corrective_failure")
                    .map(value => <option key={value} value={value}>{ui(policyNames[value])}</option>)}
                </select>
              </Label>
              <Label className="block space-y-2">{ui("Cor do motivo")}
                <Input type="color" value={draft.color} disabled={busy}
                  onChange={e => setDraft({ ...draft, color: e.target.value })} />
              </Label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.active} disabled={busy}
                  onChange={e => setDraft({ ...draft, active: e.target.checked })} />
                {ui("Motivo ativo")}
              </label>
              <Button type="button" disabled={busy || !draft.displayName.trim()} onClick={() => void saveReason()}>
                {ui(chosen ? "Salvar motivo" : "Cadastrar motivo")}
              </Button>
            </div>
            {chosen && (
              <section className="space-y-3 border-t border-border pt-4">
                <h4 className="font-semibold">{ui("Especialidades deste motivo")}</h4>
                {chosen.options.length === 0 && <p className="text-sm text-muted-foreground">{ui("Nenhuma especialidade vinculada.")}</p>}
                {chosen.options.map(option => (
                  <div key={option.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <div>
                      <p className="font-semibold">{option.displayName ?? option.technicalArea.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {ui("KPI")}: {ui(option.effectivePolicy.effectiveKpiStatus)} ·
                        {option.effectivePolicy.correctiveCandidate
                          ? ui("Candidata ao KPI corretivo mediante evidências")
                          : ui("Não é falha corretiva automática")}
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" disabled={busy}
                      onClick={() => void toggleArea(option.id, option.revision, !option.active)}>
                      {ui(option.active ? "Inativar" : "Ativar")}
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap items-end gap-2">
                  <Label className="min-w-48 flex-1 space-y-2">{ui("Vincular especialidade")}
                    <select className="h-10 w-full rounded-md border border-input bg-background px-3"
                      value={areaToAdd} disabled={busy}
                      onChange={e => setAreaToAdd(e.target.value)}>
                      <option value="">{ui("Selecione uma especialidade")}</option>
                      {areas.filter(area => area.active && !chosen.options.some(option => option.technicalAreaId === area.id))
                        .map(area => <option key={area.id} value={area.id}>{area.displayName}</option>)}
                    </select>
                  </Label>
                  <Button type="button" disabled={busy || !areaToAdd} onClick={() => void addArea()}>
                    {ui("Vincular")}
                  </Button>
                </div>
              </section>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
