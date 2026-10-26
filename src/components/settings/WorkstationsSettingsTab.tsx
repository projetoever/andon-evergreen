import { getInterfaceLocale, ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getCurrentWorkstationId } from "@/services/workstationIdentityService";
import {
  listWorkstations,
  registerCurrentWorkstation,
  updateWorkstation,
} from "@/services/workstationService";
import type { Workstation } from "@/types/workstation";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { WorkstationAdmissionSettings } from "./WorkstationAdmissionSettings";
import { toast } from "@/i18n/toast";

function workstationLabel(workstation: Workstation) {
  return (
    workstation.name || ui("Workstation não identificada · {0}", { 0: workstation.id.slice(-8) })
  );
}

function formatLastSeen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ui("Não informado")
    : date.toLocaleString(getInterfaceLocale());
}

export function WorkstationsSettingsTab() {
  useInterfaceLanguage();
  const { refresh } = useModuleAccess();
  const currentWorkstationId = getCurrentWorkstationId();
  const [items, setItems] = useState<Workstation[]>([]);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return items
      .filter((workstation) => {
        if (statusFilter === "active" && !workstation.active) return false;
        if (statusFilter === "inactive" && workstation.active) return false;
        if (!normalizedQuery) return true;

        const haystack =
          `${workstationLabel(workstation)} ${workstation.id} ${workstation.lastIpAddress ?? ""}`
            .toLocaleLowerCase("pt-BR")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (a.id === currentWorkstationId) return -1;
        if (b.id === currentWorkstationId) return 1;
        return workstationLabel(a).localeCompare(workstationLabel(b), "pt-BR");
      });
  }, [currentWorkstationId, items, searchQuery, statusFilter]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      await registerCurrentWorkstation();
      const workstations = await listWorkstations();
      setItems(workstations);
      setDraftNames(
        Object.fromEntries(
          workstations.map((workstation) => [workstation.id, workstation.name ?? ""]),
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : ui("Falha ao carregar workstations.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveName(workstation: Workstation) {
    const name = (draftNames[workstation.id] ?? "").trim().replace(/\s+/g, " ");
    if (savingId || name.length > 120 || name === (workstation.name ?? "")) return;
    setSavingId(workstation.id);
    try {
      const updated = await updateWorkstation(workstation.id, {
        name,
      });
      setItems((current) => current.map((item) => (item.id === workstation.id ? updated : item)));
      setDraftNames((current) => ({ ...current, [updated.id]: updated.name ?? "" }));
      toast.success("Nome da workstation atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar workstation.");
    } finally {
      setSavingId(null);
    }
  }

  async function changeActive(workstation: Workstation, active: boolean) {
    setSavingId(workstation.id);
    try {
      const updated = await updateWorkstation(workstation.id, { active });
      setItems((current) => current.map((item) => (item.id === workstation.id ? updated : item)));
      await refresh();
      toast.success(
        active
          ? "Workstation ativada. Acesso liberado."
          : "Workstation inativada. Acesso bloqueado.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar workstation.");
    } finally {
      setSavingId(null);
    }
  }

  async function changeModule(
    workstation: Workstation,
    field: "allowOperational" | "allowBi" | "allowPriorities",
    allowed: boolean,
  ) {
    setSavingId(workstation.id);
    try {
      const updated = await updateWorkstation(workstation.id, { [field]: allowed });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await refresh();
      toast.success("Permissão do módulo atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar permissão.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <WorkstationAdmissionSettings />
      <div className="space-y-1">
        <h3 className="text-base font-bold">{ui("Workstations conhecidas")}</h3>
        <p className="text-sm text-muted-foreground">
          {ui(
            "Cada navegador tem uma identidade própria. O IP é registrado pelo servidor no último acesso. A ativação geral e as permissões abaixo controlam os três módulos.",
          )}
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-muted-foreground">
            {filteredItems.length}
            {ui(" de ")}
            {items.length}
            {ui(" workstation(s)")}
          </p>
          {(searchQuery || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
              className="text-xs font-bold text-primary hover:underline"
            >
              {ui("Limpar filtros")}
            </button>
          )}
        </div>

        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={ui("Pesquisar nome, ID ou IP...")}
            aria-label={ui("Pesquisar workstations por nome ou ID (inclui IP)")}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label={ui("Limpar pesquisa de workstations")}
              onClick={() => setSearchQuery("")}
              className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div
          className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/20 p-1"
          aria-label={ui("Filtrar workstations por status")}
        >
          {(
            [
              ["all", ui("Todas")],
              ["active", ui("Ativas")],
              ["inactive", ui("Inativas")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(value)}
              className={
                statusFilter === value
                  ? "min-h-9 rounded-md bg-primary px-2 text-xs font-bold text-primary-foreground shadow-sm"
                  : "min-h-9 rounded-md px-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">{ui("Carregando workstations...")}</p>
      )}

      {!isLoading && loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          <span>{systemMessage(loadError)}</span>
          <button type="button" className="font-bold underline" onClick={() => void load()}>
            {ui("Tentar novamente")}
          </button>
        </div>
      )}

      {!isLoading && !loadError && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
          <p className="text-sm font-bold">{ui("Nenhuma workstation registrada")}</p>
        </div>
      )}

      {!isLoading && !loadError && items.length > 0 && filteredItems.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
          <p className="text-sm font-bold">{ui("Nenhuma workstation encontrada")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ui("Ajuste a pesquisa ou o filtro de status.")}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {filteredItems.map((workstation) => {
          const isCurrent = workstation.id === currentWorkstationId;
          const isSaving = savingId !== null;
          const expanded = expandedIds[workstation.id] ?? false;
          const normalizedName = (draftNames[workstation.id] ?? "").trim().replace(/\s+/g, " ");
          const canSaveName =
            normalizedName.length <= 120 && normalizedName !== (workstation.name ?? "");

          return (
            <Collapsible
              key={workstation.id}
              open={expanded}
              onOpenChange={(open) =>
                setExpandedIds((current) => ({ ...current, [workstation.id]: open }))
              }
              asChild
            >
              <Card
                className={[
                  "min-w-0 overflow-hidden",
                  isCurrent ? "border-primary/50 ring-1 ring-primary/30" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="grid w-full min-w-0 grid-cols-2 gap-3 p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] lg:items-center"
                  >
                    <span className="col-span-2 min-w-0 space-y-1 lg:col-span-1">
                      <span className="block break-words text-sm font-bold [overflow-wrap:anywhere]">
                        {workstationLabel(workstation)}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {isCurrent && (
                          <Badge variant="outline" className="border-primary/40 text-primary">
                            {ui("Esta workstation")}
                          </Badge>
                        )}
                        <Badge variant={workstation.active ? "secondary" : "outline"}>
                          {workstation.pendingApproval
                            ? ui("Aguardando aprovação")
                            : workstation.active
                              ? ui("Liberado")
                              : ui("Bloqueado")}
                        </Badge>
                      </span>
                    </span>
                    <span className="min-w-0 text-xs">
                      <span className="block text-muted-foreground">
                        {ui("IP do último acesso: ")}
                      </span>
                      <span className="block break-all font-mono font-semibold">
                        {workstation.lastIpAddress ?? ui("Não identificado")}
                      </span>
                    </span>
                    <span className="min-w-0 text-xs">
                      <span className="block text-muted-foreground">{ui("Último acesso: ")}</span>
                      <span className="block break-words">
                        {formatLastSeen(workstation.lastSeenAt)}
                      </span>
                    </span>
                    <span className="col-span-2 flex items-center gap-2 text-xs font-semibold text-primary lg:col-span-1">
                      {expanded ? ui("Recolher") : ui("Expandir")}
                      <ChevronDown
                        aria-hidden="true"
                        className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4 border-t border-border p-4">
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {ui("UUID:")} {workstation.id}
                    </p>
                    {workstation.lockedMachineId && (
                      <p className="text-xs text-muted-foreground">
                        {ui("Tela fixada na máquina")}: {workstation.lockedMachineId}
                      </p>
                    )}
                    <div className="space-y-1">
                      <Label htmlFor={`workstation-name-${workstation.id}`}>
                        {ui("Nome amigável")}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id={`workstation-name-${workstation.id}`}
                          value={draftNames[workstation.id] ?? ""}
                          className="min-w-0"
                          disabled={isSaving}
                          maxLength={120}
                          placeholder={ui("Ex.: PC Máquina 37")}
                          onChange={(event) =>
                            setDraftNames((current) => ({
                              ...current,
                              [workstation.id]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isSaving || !canSaveName}
                          onClick={() => void saveName(workstation)}
                        >
                          {ui("Salvar")}
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <label className="flex min-h-11 items-center gap-2 font-semibold">
                        <Switch
                          aria-label={ui("Ativação geral · {0}", {
                            0: workstationLabel(workstation),
                          })}
                          checked={workstation.active}
                          disabled={
                            isSaving ||
                            (workstation.active &&
                              (isCurrent || Boolean(workstation.lockedMachineId)))
                          }
                          onCheckedChange={(active) => void changeActive(workstation, active)}
                        />
                        {workstation.pendingApproval
                          ? ui("Aprovar estação")
                          : workstation.active
                            ? ui("Liberado")
                            : ui("Bloqueado")}
                      </label>
                    </div>
                    <div className="space-y-3 rounded-lg border border-border p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {ui("Módulos autorizados")}
                      </p>
                      {(
                        [
                          ["allowOperational", ui("ANDON operacional")],
                          ["allowBi", "ANDON BI"],
                          ["allowPriorities", ui("Prioridades de produção")],
                        ] as const
                      ).map(([field, label]) => (
                        <label
                          key={field}
                          className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold"
                        >
                          {label}
                          <Switch
                            aria-label={`${label} · ${workstationLabel(workstation)}`}
                            checked={workstation[field]}
                            disabled={
                              isSaving ||
                              (field === "allowOperational" && Boolean(workstation.lockedMachineId))
                            }
                            onCheckedChange={(allowed) =>
                              void changeModule(workstation, field, allowed)
                            }
                          />
                        </label>
                      ))}
                      <p className="text-xs text-muted-foreground">
                        {ui(
                          "Módulos não autorizados ficam ocultos no Hub. Uma tela fixada deve ser desbloqueada antes de retirar o acesso operacional.",
                        )}
                      </p>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
