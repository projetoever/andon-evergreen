import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "sonner";

function workstationLabel(workstation: Workstation) {
  return workstation.name || `Workstation não identificada · ${workstation.id.slice(-8)}`;
}

function formatLastSeen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Não informado" : date.toLocaleString("pt-BR");
}

export function WorkstationsSettingsTab() {
  const currentWorkstationId = getCurrentWorkstationId();
  const [items, setItems] = useState<Workstation[]>([]);
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

        const haystack = `${workstationLabel(workstation)} ${workstation.id}`
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
        error instanceof Error ? error.message : "Falha ao carregar workstations.";
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
    setSavingId(workstation.id);
    try {
      const updated = await updateWorkstation(workstation.id, {
        name: draftNames[workstation.id] ?? "",
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
      toast.success(active ? "Workstation ativada." : "Workstation inativada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar workstation.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-bold">Workstations conhecidas</h3>
        <p className="text-sm text-muted-foreground">
          Identidades geradas pelo ANDON para cada navegador. Não utilizam IP ou dados do Windows.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-muted-foreground">
            {filteredItems.length} de {items.length} workstation(s)
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
              Limpar filtros
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
            placeholder="Pesquisar nome ou ID..."
            aria-label="Pesquisar workstations por nome ou ID"
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Limpar pesquisa de workstations"
              onClick={() => setSearchQuery("")}
              className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div
          className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/20 p-1"
          aria-label="Filtrar workstations por status"
        >
          {(
            [
              ["all", "Todas"],
              ["active", "Ativas"],
              ["inactive", "Inativas"],
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

      {isLoading && <p className="text-sm text-muted-foreground">Carregando workstations...</p>}

      {!isLoading && loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          <span>{loadError}</span>
          <button type="button" className="font-bold underline" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && !loadError && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
          <p className="text-sm font-bold">Nenhuma workstation registrada</p>
        </div>
      )}

      {!isLoading && !loadError && items.length > 0 && filteredItems.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
          <p className="text-sm font-bold">Nenhuma workstation encontrada</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajuste a pesquisa ou o filtro de status.
          </p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {filteredItems.map((workstation) => {
          const isCurrent = workstation.id === currentWorkstationId;
          const isSaving = workstation.id === savingId;

          return (
            <Card
              key={workstation.id}
              className={[
                isCurrent ? "border-primary ring-1 ring-primary/30" : "",
                !workstation.active ? "opacity-70" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <CardHeader className="space-y-2 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{workstationLabel(workstation)}</CardTitle>
                  <div className="flex gap-2">
                    {isCurrent && <Badge>Esta workstation</Badge>}
                    <Badge variant={workstation.active ? "secondary" : "outline"}>
                      {workstation.active ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {workstation.id}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor={`workstation-name-${workstation.id}`}>Nome amigável</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`workstation-name-${workstation.id}`}
                      value={draftNames[workstation.id] ?? ""}
                      maxLength={120}
                      placeholder="Ex.: PC Máquina 37"
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
                      disabled={isSaving}
                      onClick={() => void saveName(workstation)}
                    >
                      Salvar
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    Último acesso: {formatLastSeen(workstation.lastSeenAt)}
                  </span>
                  <label className="flex items-center gap-2 font-semibold">
                    <Switch
                      checked={workstation.active}
                      disabled={isSaving}
                      onCheckedChange={(active) => void changeActive(workstation, active)}
                    />
                    {workstation.active ? "Ativa" : "Inativa"}
                  </label>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
