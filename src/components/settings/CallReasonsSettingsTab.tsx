import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompactAndonColorField } from "./CompactAndonColorField";
import { toast } from "@/i18n/toast";
import { ui } from "@/i18n/translate";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { getSystemSettings, SYSTEM_SETTINGS_CHANGED_EVENT } from "@/services/systemSettingsService";
import { getCategoryConfigs } from "@/services/categoryConfigService";
import type { AndonCategoryConfig } from "@/types/settings";
import {
  addCallReasonOption, createCallReason, getCallReasonsCatalog,
  updateCallReason, updateCallReasonOption, removeCallReasonOption,
  type CallReasonView, type CreateCallReason,
} from "@/services/callReasonsCatalogService";

const natures = [
  ["corrective_failure", "Manutenção corretiva"],
  ["planned_setup", "Setup programado"],
  ["production_support", "Apoio à produção"],
  ["unclassified", "Não classificado"],
] as const;
const dispositionNames = [
  ["include", "Ocorrência válida — aparece no BI operacional"],
  ["test", "Teste — excluído das estatísticas"],
  ["false_call", "Falso chamado — excluído das estatísticas"],
  ["duplicate", "Duplicado — excluído das estatísticas"],
] as const;
const ID = /^[a-z0-9_]{2,40}$/;

function makeId(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0,40);
}

// A mesma regra de legibilidade dos botões originais da máquina.
function readableGroupTextColor(hex: string) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return "#FFFFFF";
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 145 ? "#071015" : "#FFFFFF";
}

type Draft = CreateCallReason;
const emptyDraft = (): Draft => ({
  id: "", displayName: "", color: "#64748B", active: true, displayOrder: 10,
  nature: "unclassified", suggestedResponsibility: "unassigned",
  maintenanceKpiPolicy: "pending", analyticsDisposition: "include",
});

export function CallReasonsSettingsTab() {
  useLanguage();
  const { access } = useModuleAccess();
  const isPrimaryAdmin = access?.principal?.isPrimaryAdmin === true;
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  const catalogLoadedRef = useRef(false);
  const [capabilityChecking, setCapabilityChecking] = useState(false);
  const [capabilityError, setCapabilityError] = useState(false);
  const [reasons, setReasons] = useState<CallReasonView[]>([]);
  const [reasonQuery, setReasonQuery] = useState("");
  const [reasonStatus, setReasonStatus] = useState<"all" | "active" | "inactive">("all");
  const [areas, setAreas] = useState<AndonCategoryConfig[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [areaToAdd, setAreaToAdd] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [policyAcknowledged, setPolicyAcknowledged] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [optionOrder, setOptionOrder] = useState("");
  const [confirmRemoveOptionId, setConfirmRemoveOptionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A cached feature flag never authorizes writes when Hub identity is unknown.
  const writeBlocked = access === null || busy || capabilityChecking || !enabled || Boolean(error) || loading;
  const chosen = useMemo(() => reasons.find(reason => reason.id === selected) ?? null, [reasons, selected]);
  const filteredReasons = useMemo(() => {
    const query = reasonQuery.trim().toLocaleLowerCase("pt-BR")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return reasons.filter(reason => {
      if (reasonStatus === "active" && !reason.active) return false;
      if (reasonStatus === "inactive" && reason.active) return false;
      if (!query) return true;
      const labels = [reason.id, reason.displayName, reason.nature,
        ...reason.options.flatMap(option => [
          option.displayName ?? "", option.technicalArea.displayName,
        ])].join(" ").toLocaleLowerCase("pt-BR")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return labels.includes(query);
    });
  }, [reasons, reasonQuery, reasonStatus]);
  // Display changes use a presentation-only payload. New analytical policy
  // decisions require explicit human confirmation, then server authorization.
  const policyReviewNeeded = isPrimaryAdmin && (chosen
    ? chosen.nature !== draft.nature ||
      chosen.maintenanceKpiPolicy !== draft.maintenanceKpiPolicy ||
      chosen.analyticsDisposition !== draft.analyticsDisposition
    : draft.maintenanceKpiPolicy === "eligible" || draft.analyticsDisposition !== "include");
  const restrictedDelegatedLink = !isPrimaryAdmin &&
    (chosen?.maintenanceKpiPolicy === "eligible" || chosen?.active !== true);
  const linkableAreas = chosen ? areas.filter(area =>
    area.active &&
    !chosen.options.some(option => option.technicalAreaId === area.id) &&
    (chosen.nature !== "corrective_failure" || area.categoryGroup === "maintenance")
  ) : [];

  const refresh = useCallback(async (preferred?: string | null) => {
    setLoading(true);
    setError(null);
    setEditingOptionId(null);
    setConfirmRemoveOptionId(null);
    try {
      const settings = await getSystemSettings();
      const allowed = settings.centralCallReasonsCatalogEnabled === true;
      enabledRef.current = allowed;
      setEnabled(allowed);
      setCapabilityError(false);
      if (!allowed) {
        catalogLoadedRef.current = false;
        setReasons([]);
        setAreas([]);
        return;
      }
      const [catalog, technicalAreas] = await Promise.all([
        getCallReasonsCatalog(), getCategoryConfigs(),
      ]);
      catalogLoadedRef.current = true;
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
      enabledRef.current = false;
      setEnabled(false);
      setError(err instanceof Error ? err.message : ui("Erro ao carregar os grupos de chamados."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // CFG-15I: a server feature gate can change while this tab stays open.
  // A focus/event only checks capabilities; it never overwrites drafts.
  useEffect(() => {
    let active = true;
    let requestVersion = 0;
    const revalidate = () => {
      const request = ++requestVersion;
      setCapabilityChecking(true); // fail closed while GET is pending
      setCapabilityError(false);
      void getSystemSettings().then(value => {
        if (!active || request !== requestVersion) return;
        if (value.centralCallReasonsCatalogEnabled !== true) {
          enabledRef.current = false;
          catalogLoadedRef.current = false;
          setEnabled(false);
        } else if (!catalogLoadedRef.current) {
          void refresh(); // first activation: protected catalog GET required
        } else {
          enabledRef.current = true;
          setEnabled(true); // preserve the draft already being edited
        }
      }).catch(() => {
        if (!active || request !== requestVersion) return;
        enabledRef.current = false;
        setEnabled(false);
        setCapabilityError(true);
      }).finally(() => {
        if (active && request === requestVersion) setCapabilityChecking(false);
      });
    };
    window.addEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate);
    window.addEventListener("focus", revalidate);
    return () => {
      active = false;
      requestVersion += 1;
      window.removeEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate);
      window.removeEventListener("focus", revalidate);
    };
  }, [refresh]);

  function createReasonDraft() {
    if (writeBlocked) return;
    setConfirmRemoveOptionId(null);
    setSelected(null);
    setDraft({
      ...emptyDraft(),
      displayOrder: Math.min(9999, Math.max(0, ...reasons.map(reason => reason.displayOrder)) + 10),
    });
    setAreaToAdd("");
    setEditingOptionId(null);
    setPolicyAcknowledged(false);
  }

  function edit(reason: CallReasonView) {
    setConfirmRemoveOptionId(null);
    setPolicyAcknowledged(false);
    setEditingOptionId(null);
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
    if (writeBlocked) return;
    if (policyReviewNeeded && !policyAcknowledged) return;
    const next: Draft = {
      ...draft,
      id: selected ?? makeId(draft.displayName),
      displayName: draft.displayName.trim(),
      // Preserve an existing policy owner unless the nature is changed
      // deliberately. Editing labels/colors must never rewrite KPI ownership.
      suggestedResponsibility: chosen && chosen.nature === draft.nature
        ? chosen.suggestedResponsibility
        : draft.nature === "corrective_failure" ? "maintenance"
          : draft.nature === "planned_setup" || draft.nature === "production_support"
            ? "operations" : "unassigned",
      maintenanceKpiPolicy: draft.nature !== "corrective_failure" &&
        draft.maintenanceKpiPolicy === "eligible" ? "excluded" : draft.maintenanceKpiPolicy,
    };
    if (!ID.test(next.id) || !next.displayName) {
      toast.error(ui("Informe um nome e identificador válido para o grupo."));
      return;
    }
    if (!Number.isSafeInteger(next.displayOrder) ||
        next.displayOrder < 0 || next.displayOrder > 9999) {
      toast.error(ui("Informe uma ordem de 0 a 9999 para o grupo."));
      return;
    }
    setBusy(true);
    try {
      if (chosen) {
        const { id: _id, ...values } = next;
        const presentationOnly = {
          displayName: next.displayName, color: next.color,
          active: next.active, displayOrder: next.displayOrder,
        };
        await updateCallReason(chosen.id, chosen.revision,
          isPrimaryAdmin && policyReviewNeeded ? values : presentationOnly);
      } else {
        await createCallReason(isPrimaryAdmin ? next : {
          id: next.id, displayName: next.displayName, color: next.color,
          active: next.active, displayOrder: next.displayOrder, nature: next.nature,
        });
      }
      await refresh(next.id);
      setPolicyAcknowledged(false);
      toast.success(ui("Grupo de chamados salvo."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ui("Não foi possível salvar o grupo."));
    } finally { setBusy(false); }
  }

  async function addArea() {
    if (!chosen || !areaToAdd || busy || restrictedDelegatedLink || writeBlocked) return;
    const area = areas.find(item => item.id === areaToAdd);
    if (!area?.active || !linkableAreas.some(item => item.id === area.id)) return;
    setBusy(true);
    try {
      await addCallReasonOption(chosen.id, {
        id: makeId(chosen.id + "_" + area.id),
        technicalAreaId: area.id,
        displayName: area.displayName,
        active: true,
        displayOrder: chosen.options.length * 10 + 10,
      });
      await refresh(chosen.id);
      setAreaToAdd("");
      toast.success(ui("Setor vinculado ao grupo."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ui("Não foi possível vincular o setor."));
    } finally { setBusy(false); }
  }

  async function toggleArea(optionId: string, revision: number, active: boolean) {
    if (!chosen || writeBlocked) return;
    setBusy(true);
    try {
      await updateCallReasonOption(chosen.id, optionId, revision, { active });
      await refresh(chosen.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ui("Não foi possível alterar o setor."));
    } finally { setBusy(false); }
  }

  function beginOptionEdit(option: CallReasonView["options"][number]) {
    if (busy) return;
    setConfirmRemoveOptionId(null);
    setEditingOptionId(option.id);
    setOptionOrder(String(option.displayOrder));
  }

  async function saveOptionPresentation(option: CallReasonView["options"][number]) {
    if (!chosen || writeBlocked || editingOptionId !== option.id) return;
    const orderText = optionOrder.trim();
    const order = Number(orderText);
    if (!/^\d{1,4}$/.test(orderText) ||
        !Number.isSafeInteger(order) || order < 0 || order > 9999) {
      toast.error(ui("Informe uma ordem de 0 a 9999."));
      return;
    }
    if (option.displayOrder === order) {
      setEditingOptionId(null);
      return;
    }
    setBusy(true);
    try {
      // Only presentation fields are delegated: no specialty reassignment,
      // reason nature, KPI policy, responsibility or analytics override.
      await updateCallReasonOption(chosen.id, option.id, option.revision, {
        displayOrder: order,
      });
      await refresh(chosen.id);
      toast.success(ui("Apresentação do setor no grupo atualizada."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ui("Não foi possível salvar a apresentação do setor."));
    } finally { setBusy(false); }
  }

  async function removeArea(option: CallReasonView["options"][number]) {
    if (!chosen || !isPrimaryAdmin || writeBlocked || confirmRemoveOptionId !== option.id) return;
    setBusy(true);
    try {
      await removeCallReasonOption(chosen.id, option.id, option.revision);
      await refresh(chosen.id);
      toast.success(ui("Setor removido do grupo. Seu cadastro e os chamados existentes foram preservados."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ui("Não foi possível remover o setor do grupo."));
    } finally {
      setBusy(false);
      setConfirmRemoveOptionId(null);
    }
  }

  return (
    <div className="space-y-2">
      <header className="space-y-0.5">
        <h2 className="text-lg font-bold">{ui("Grupos de chamados")}</h2>
        <p className="text-sm text-muted-foreground">
          {ui("Grupos são atalhos opcionais para os setores já cadastrados. Os botões diretos continuam disponíveis; o grupo define a elegibilidade aos KPIs corretivos, sem alterar o setor, o alarme ou o histórico.")}
        </p>
      </header>
      {loading && <p role="status">{ui("Carregando grupos...")}</p>}
      {capabilityChecking && !loading && (
        <p role="status" className="text-xs text-muted-foreground">
          {ui("Verificando disponibilidade dos grupos...")}
        </p>
      )}
      {capabilityError && !loading && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs">
          <span>{ui("Não foi possível confirmar a disponibilidade do catálogo. Nenhuma edição será enviada.")}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
            {ui("Tentar novamente")}
          </Button>
        </div>
      )}
      {!loading && !enabled && (
        <div className="rounded-lg border border-warning/50 bg-card p-4" role="status">
          <p className="font-semibold">{ui("Catálogo em homologação — edição indisponível")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {ui("A configuração dos grupos está desabilitada neste ambiente. Os setores existentes continuam operacionais.")}
          </p>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void refresh()}>
            {ui("Verificar novamente")}
          </Button>
        </div>
      )}
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/40 p-3 text-sm text-danger">
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
            {ui("Tentar novamente")}
          </Button>
        </div>
      )}
      {!loading && enabled && !isPrimaryAdmin && !error && (
        <p role="note" className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {ui("Config. do ANDON: você pode criar grupos conservadores e vincular setores existentes. Elegibilidade corretiva é exclusiva do Admin principal.")}
        </p>
      )}
      {!loading && enabled && !error && (
        <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(190px,0.5fr)_minmax(0,1.8fr)]">
          <section className="space-y-2 rounded-lg border border-border bg-card p-3" aria-label={ui("Grupos cadastrados")}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{ui("Grupos cadastrados")}</h3>
              <Button type="button" variant="outline" size="sm" disabled={writeBlocked}
                onClick={createReasonDraft}>
                {ui("Novo grupo")}
              </Button>
            </div>
            <label className="block space-y-1 text-xs text-muted-foreground">
              {ui("Pesquisar grupos e setores")}
              <Input type="search" value={reasonQuery}
                onChange={event => setReasonQuery(event.target.value)}
                placeholder={ui("Nome, ID ou setor...")}
                aria-label={ui("Pesquisar grupos e setores")} />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {filteredReasons.length} {ui("de")} {reasons.length} {ui("grupos")}
              </p>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {ui("Status")}
                <select className="min-h-9 rounded-md border border-border bg-background px-2"
                  value={reasonStatus}
                  onChange={event => setReasonStatus(event.target.value as typeof reasonStatus)}
                  aria-label={ui("Filtrar grupos por status")}>
                  <option value="all">{ui("Todos")}</option>
                  <option value="active">{ui("Ativos")}</option>
                  <option value="inactive">{ui("Inativos")}</option>
                </select>
              </label>
            </div>
            {reasons.length === 0 && <p className="text-sm text-muted-foreground">{ui("Nenhum grupo cadastrado.")}</p>}
            {reasons.length > 0 && filteredReasons.length === 0 &&
              <p className="text-sm text-muted-foreground">{ui("Nenhum grupo encontrado. Ajuste a pesquisa ou o filtro.")}</p>}
            <div className="max-h-[min(62dvh,36rem)] space-y-1 overflow-y-auto pr-1">
            {filteredReasons.map(reason => (
              <button type="button" key={reason.id}
                data-group-preview="true"
                onClick={() => edit(reason)}
                aria-pressed={selected === reason.id}
                className={"flex min-h-12 w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (selected === reason.id ? "border-primary bg-primary/10" : "border-border bg-background") +
                  (!reason.active ? " opacity-60" : "")}>
                <span aria-hidden="true" className="h-8 w-2 shrink-0 rounded-sm" style={{ backgroundColor: reason.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold uppercase">{reason.displayName}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {reason.options.length} {ui("setores")} · {ui(reason.active ? "Ativo" : "Inativo")}
                  </span>
                </span>
              </button>
            ))}
            </div>
          </section>
          <section className="space-y-3 rounded-lg border border-border bg-card p-3" aria-label={ui("Editar grupo")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">{ui(chosen ? "Editar grupo" : "Criar grupo")}</h3>
              <div className="flex min-w-0 items-center gap-2"
                aria-label={ui("Prévia do botão do grupo no ANDON")}>
                <span className="text-xs font-semibold text-muted-foreground">{ui("Prévia no ANDON")}</span>
                <div className="flex min-h-10 min-w-28 max-w-48 items-center justify-center rounded-md border-2 px-2 py-1 text-center text-xs font-black uppercase shadow-sm"
                  style={{ backgroundColor: draft.color, borderColor: draft.color, color: readableGroupTextColor(draft.color) }}>
                  <span className="break-words [overflow-wrap:anywhere]">{draft.displayName.trim() || ui("Novo grupo")}</span>
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Label className="block space-y-2">{ui("Nome do grupo")}
                <Input value={draft.displayName} maxLength={80} disabled={writeBlocked}
                  onChange={e => setDraft({ ...draft, displayName: e.target.value })} />
              </Label>
              <Label className="block space-y-2">{ui("Natureza do chamado")}
                <select className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={draft.nature} disabled={writeBlocked || (Boolean(chosen) && !isPrimaryAdmin)}
                  onChange={e => { setPolicyAcknowledged(false); setDraft({
                    ...draft, nature: e.target.value as Draft["nature"],
                    maintenanceKpiPolicy: e.target.value === "corrective_failure" ? "pending" : "excluded",
                  }); }}>
                  {natures.map(([value, title]) => <option key={value} value={value}>{ui(title)}</option>)}
                </select>
              </Label>
              <label className="flex min-h-10 flex-col justify-center gap-1 rounded-lg border border-border bg-muted/20 p-2 text-sm">
                <span className="font-semibold">{ui("Elegibilidade do grupo aos KPIs corretivos")}</span>
                <span className="flex items-center gap-2">
                  <input type="checkbox"
                    checked={draft.maintenanceKpiPolicy === "eligible"}
                    disabled={writeBlocked || !isPrimaryAdmin || draft.nature !== "corrective_failure"}
                    onChange={event => { setPolicyAcknowledged(false); setDraft({
                      ...draft, maintenanceKpiPolicy: event.target.checked ? "eligible" : "excluded",
                    }); }} />
                  {ui("Permitir contabilização corretiva mediante evidências")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {ui(draft.maintenanceKpiPolicy === "pending"
                    ? "Pendente: não habilitado até definição do Admin"
                    : draft.maintenanceKpiPolicy === "excluded"
                      ? "Excluído dos KPIs corretivos"
                      : "Apenas candidato: exige classificação e prova de falha física")}
                </span>
              </label>
              <Label className="block space-y-2">{ui("Registro no BI operacional (histórico e volume)")}
                <select className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={draft.analyticsDisposition} disabled={writeBlocked || !isPrimaryAdmin}
                  onChange={event => { setPolicyAcknowledged(false); setDraft({
                    ...draft, analyticsDisposition: event.target.value,
                  }); }}>
                  {dispositionNames.map(([value, label]) =>
                    <option key={value} value={value}>{ui(label)}</option>)}
                </select>
              </Label>
              <CompactAndonColorField label={ui("Cor do grupo")} value={draft.color}
                disabled={writeBlocked}
                onChange={color => setDraft(previous => ({ ...previous, color }))} />
              <Label className="block space-y-2">{ui("Ordem de exibição do grupo")}
                <Input type="number" min={0} max={9999} step={1}
                  value={draft.displayOrder} disabled={writeBlocked}
                  onChange={event => setDraft({ ...draft,
                    displayOrder: Number(event.target.value) })} />
              </Label>
            </div>
            {draft.analyticsDisposition === "include" && (
              <p role="status" className={draft.nature === "corrective_failure" && draft.maintenanceKpiPolicy === "eligible"
                ? "rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300"
                : "rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"}>
                {ui(draft.nature === "corrective_failure" && draft.maintenanceKpiPolicy === "eligible"
                  ? "Grupo candidato aos KPIs corretivos. O registro ainda precisa de diagnóstico confirmado, finalização e prova física para MTTR/MTBF."
                  : "ATENÇÃO: o grupo aparece no BI operacional, mas NÃO está elegível aos KPIs corretivos. Se for manutenção corretiva, o Admin deve definir Natureza = Manutenção corretiva e marcar Permitir contabilização corretiva mediante evidências. SETUP/Apoio permanecem não corretivos.")}
              </p>
            )}
            <details className="rounded-lg border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-semibold text-foreground">{ui("Prévia do tratamento do chamado no BI")}</summary>
              <div className="mt-2 space-y-1">
              <p>{ui("BI operacional")}: {ui(draft.analyticsDisposition === "include"
                ? "Ocorrência válida — tempos e volume acompanhados"
                : "Registro excluído das estatísticas por classificação de teste/falso/duplicado")}</p>
              <p>{ui("KPIs de manutenção corretiva")}: {ui(draft.nature !== "corrective_failure" ||
                draft.maintenanceKpiPolicy === "excluded" || draft.analyticsDisposition !== "include"
                ? "Não integra MTTA, MTTR ou MTBF corretivos"
                : draft.maintenanceKpiPolicy === "pending"
                  ? "Pendente de classificação; não entra automaticamente"
                  : "Apenas candidato, sujeito a evidências de falha e parada física")}</p>
              <p>{ui("O histórico, os tempos reais e o downtime físico permanecem separados; configurar um grupo não altera chamados anteriores.")}</p>
              </div>
            </details>
            {!chosen && !isPrimaryAdmin && (
              <p role="note" className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                {ui("Novos grupos não entram automaticamente nos KPIs corretivos. Somente o Admin principal pode autorizar elegibilidade mediante evidências.")}
              </p>
            )}
            {policyReviewNeeded && (
              <label className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/5 p-3 text-sm">
                <input type="checkbox" checked={policyAcknowledged} disabled={writeBlocked}
                  onChange={e => setPolicyAcknowledged(e.target.checked)} />
                <span>{ui("Confirmar alteração")} · {ui("Política de KPI corretivo")}</span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.active} disabled={writeBlocked}
                  onChange={e => setDraft({ ...draft, active: e.target.checked })} />
                {ui("Grupo ativo")}
              </label>
              <Button type="button" disabled={writeBlocked || !draft.displayName.trim() || (policyReviewNeeded && !policyAcknowledged)} onClick={() => void saveReason()}>
                {ui(chosen ? "Salvar grupo" : "Cadastrar grupo")}
              </Button>
            </div>
            {chosen && (
              <section className="space-y-2 border-t border-border pt-2">
                <h4 className="font-semibold">{ui("Setores vinculados ao grupo")}</h4>
                <p className="text-xs text-muted-foreground">
                  {ui("Vincule um ou mais setores existentes ao grupo selecionado. Elétrica, Mecânica e outros setores mantêm seus identificadores originais; a política analítica pertence ao grupo.")}
                </p>
                {chosen.options.length === 0 && <p className="text-sm text-muted-foreground">{ui("Nenhum setor vinculado ao grupo.")}</p>}
                <div className="grid gap-2 md:grid-cols-2">
                {chosen.options.map(option => (
                  <div key={option.id} className="flex min-w-0 flex-col justify-between gap-2 rounded-lg border border-border bg-background p-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="inline-flex min-h-10 max-w-full items-center justify-center rounded-md border-2 px-2 py-1 text-center text-xs font-black uppercase tracking-wide shadow-sm"
                        style={{
                          backgroundColor: areas.find(area => area.id === option.technicalAreaId)?.color ?? chosen.color,
                          borderColor: areas.find(area => area.id === option.technicalAreaId)?.color ?? chosen.color,
                          color: readableGroupTextColor(areas.find(area => area.id === option.technicalAreaId)?.color ?? chosen.color),
                          opacity: option.active ? 1 : 0.55,
                        }}>
                        <span className="break-words [overflow-wrap:anywhere]">
                          {option.technicalArea.displayName}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground"
                        title={ui(option.effectivePolicy.correctiveCandidate
                          ? "Candidata ao KPI corretivo mediante evidências"
                          : "Não é falha corretiva automática")}>
                        {ui("Área responsável")}: {option.technicalArea.displayName} ·
                        {ui("KPI")}: {ui(option.effectivePolicy.effectiveKpiStatus)}
                        <span className="sr-only">
                          {ui(option.effectivePolicy.correctiveCandidate
                            ? "Candidata ao KPI corretivo mediante evidências"
                            : "Não é falha corretiva automática")}
                        </span>
                      </p>
                      {editingOptionId === option.id && (
                        <div className="space-y-3 border-t border-border pt-3">
                          <Label className="block space-y-1">
                            {ui("Ordem de exibição")}
                            <Input type="number" min={0} max={9999} step={1}
                              value={optionOrder} disabled={writeBlocked}
                              onChange={event => setOptionOrder(event.target.value)} />
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" disabled={writeBlocked}
                              onClick={() => void saveOptionPresentation(option)}>
                              {ui("Salvar apresentação")}
                            </Button>
                            <Button type="button" size="sm" variant="outline" disabled={writeBlocked}
                              onClick={() => setEditingOptionId(null)}>
                              {ui("Cancelar")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-1 border-t border-border pt-2">
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs"
                        disabled={writeBlocked || confirmRemoveOptionId !== null || (editingOptionId !== null && editingOptionId !== option.id)}
                        onClick={() => editingOptionId === option.id
                          ? setEditingOptionId(null) : beginOptionEdit(option)}>
                        {ui(editingOptionId === option.id ? "Cancelar edição" : "Editar")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs"
                        disabled={writeBlocked || editingOptionId !== null || confirmRemoveOptionId !== null}
                        onClick={() => void toggleArea(option.id, option.revision, !option.active)}>
                        {ui(option.active ? "Inativar" : "Ativar")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs text-destructive"
                        title={isPrimaryAdmin ? ui("Remover somente o vínculo com o grupo") : ui("Somente o Admin principal pode desvincular setores")}
                        aria-label={ui("Remover do grupo") + ": " + option.technicalArea.displayName}
                        disabled={writeBlocked || !isPrimaryAdmin || editingOptionId !== null || confirmRemoveOptionId !== null}
                        onClick={() => setConfirmRemoveOptionId(option.id)}>
                        {ui("Remover do grupo")}
                      </Button>
                    </div>
                    {confirmRemoveOptionId === option.id && (
                      <div role="group" aria-label={ui("Confirmar remoção do vínculo")} className="space-y-2 rounded-md border border-warning/50 bg-warning/5 p-2 text-xs">
                        <p>{ui("Desvincular este setor do grupo? O setor original, os chamados e o histórico não serão excluídos.")}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="destructive" className="h-9 px-3 text-xs" disabled={writeBlocked}
                            onClick={() => void removeArea(option)}>{ui("Confirmar remoção")}</Button>
                          <Button type="button" size="sm" variant="outline" className="h-9 px-3 text-xs" disabled={busy}
                            onClick={() => setConfirmRemoveOptionId(null)}>{ui("Cancelar")}</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(150px,1fr)_auto] sm:items-end">
                  <Label className="min-w-0 space-y-2">{ui("Setor existente")}
                    <select className="h-10 w-full rounded-md border border-input bg-background px-3"
                      value={areaToAdd} disabled={writeBlocked || restrictedDelegatedLink}
                      onChange={e => setAreaToAdd(e.target.value)}>
                      <option value="">{ui("Selecione um setor")}</option>
                      {linkableAreas.map(area =>
                        <option key={area.id} value={area.id}>{area.displayName}</option>)}
                    </select>
                  </Label>
                  <Button type="button" size="sm" className="min-h-10 w-full sm:w-auto" disabled={writeBlocked || !areaToAdd || restrictedDelegatedLink}
                    onClick={() => void addArea()}>
                    {ui("Adicionar setor ao grupo")}
                  </Button>
                </div>
                {!isPrimaryAdmin && (
                  <p role="note" className="text-xs text-muted-foreground">
                    {ui(restrictedDelegatedLink
                      ? "Vínculo reservado ao Admin principal: este grupo está inativo ou possui política elegível para KPIs corretivos."
                      : "O novo vínculo usará a política do grupo e o mesmo identificador de setor. Vincule somente setores compatíveis e ativos.")}
                  </p>
                )}
              </section>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
