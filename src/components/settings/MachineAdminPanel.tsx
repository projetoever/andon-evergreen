import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Factory, Plus, Search, X } from "lucide-react";

import { useAndon } from "@/context/AndonProvider";
import type { Machine, ProductionMode } from "@/types/machine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MachineHierarchyAdminSection } from "./MachineHierarchyAdminSection";
import {
  getSystemSettings,
  SYSTEM_SETTINGS_CHANGED_EVENT,
} from "@/services/systemSettingsService";
import { filterMachinesForAdmin } from "@/utils/adminEntityFilterUtils";
import { resolveWorkOrderRequirement } from "@/utils/workOrderUtils";

function sortMachines(machines: Machine[]) {
  return [...machines].sort((a, b) => {
    const orderA = a.displayOrder ?? Number(a.id);
    const orderB = b.displayOrder ?? Number(b.id);
    if (Number.isFinite(orderA) && Number.isFinite(orderB)) return orderA - orderB;
    return a.name.localeCompare(b.name, "pt-BR", { numeric: true });
  });
}

function productionModeLabel(mode: ProductionMode) {
  return mode === "scheduled" ? "Programada" : "Não programada";
}

function machineStatusLabel(machine: Machine) {
  if (!machine.isActive) return "Inativa";
  if (machine.machineStatus === "stopped") return "Parada";
  return "Rodando";
}

function workOrderRuleLabel(machine: Machine, globalRequirement: boolean | null) {
  if (globalRequirement === true && machine.requireWorkOrderAtOpen) {
    return "OS obrigatória · global + máquina";
  }
  if (globalRequirement === true) return "OS obrigatória · global";
  if (machine.requireWorkOrderAtOpen) return "OS obrigatória · máquina";
  if (globalRequirement === null) return "OS · regra global indisponível";
  return "OS opcional";
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h4 className="text-sm font-black text-foreground">{title}</h4>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function MachineAdminPanel() {
  const { machines, createMachine, updateMachineCatalog, updateMachineActive } = useAndon();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [workOrderFilter, setWorkOrderFilter] = useState<"all" | "required" | "optional">("all");
  const [globalWorkOrderRequirement, setGlobalWorkOrderRequirement] = useState<boolean | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newProductionMode, setNewProductionMode] = useState<ProductionMode>("scheduled");
  const [newRequireWorkOrder, setNewRequireWorkOrder] = useState(false);

  const globalRequiresWorkOrder = globalWorkOrderRequirement === true;
  const sortedMachines = useMemo(() => sortMachines(machines), [machines]);
  const filteredMachines = useMemo(
    () =>
      filterMachinesForAdmin(
        sortedMachines,
        searchQuery,
        statusFilter,
        workOrderFilter,
        globalRequiresWorkOrder,
      ),
    [
      globalRequiresWorkOrder,
      searchQuery,
      sortedMachines,
      statusFilter,
      workOrderFilter,
    ],
  );

  const selectedMachine =
    selectedMachineId === null
      ? null
      : machines.find((machine) => machine.id === selectedMachineId) ?? null;
  const selectedMachineRequiresWorkOrder = selectedMachine?.requireWorkOrderAtOpen === true;
  const selectedEffectiveWorkOrderRequirement =
    selectedMachine && globalWorkOrderRequirement !== null
      ? resolveWorkOrderRequirement(
          globalWorkOrderRequirement,
          selectedMachineRequiresWorkOrder,
        )
      : selectedMachineRequiresWorkOrder
        ? true
        : null;

  useEffect(() => {
    let active = true;

    const applySettings = (settings: { requireWorkOrderAtOpen?: boolean }) => {
      if (active) {
        setGlobalWorkOrderRequirement(settings.requireWorkOrderAtOpen === true);
      }
    };

    void getSystemSettings()
      .then(applySettings)
      .catch(() => {
        if (active) setGlobalWorkOrderRequirement(null);
      });

    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ requireWorkOrderAtOpen?: boolean }>).detail;
      if (detail) applySettings(detail);
    };

    window.addEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    return () => {
      active = false;
      window.removeEventListener(SYSTEM_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    };
  }, []);

  useEffect(() => {
    if (creating) return;
    const selectedVisible = filteredMachines.some(
      (machine) => machine.id === selectedMachineId,
    );
    if (selectedVisible) return;
    setSelectedMachineId(filteredMachines[0]?.id ?? null);
  }, [creating, filteredMachines, selectedMachineId]);

  function handleStartCreate() {
    setCreating(true);
    setSelectedMachineId(null);
    setNewId("");
    setNewName("");
    setNewProductionMode("scheduled");
    setNewRequireWorkOrder(false);
  }

  function handleCreate() {
    const id = newId.trim();
    if (!id) return;

    createMachine({
      id,
      name: newName.trim() || `Máquina ${id}`,
      productionMode: newProductionMode,
      requireWorkOrderAtOpen: newRequireWorkOrder,
    });

    setCreating(false);
    setSearchQuery("");
    setSelectedMachineId(id);
    setNewId("");
    setNewName("");
    setNewProductionMode("scheduled");
    setNewRequireWorkOrder(false);
  }

  return (
    <div className="grid min-h-[620px] gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black">Máquinas</h3>
              <p className="text-xs text-muted-foreground">
                Localize e selecione uma máquina para editar.
              </p>
            </div>
            <Button type="button" size="sm" onClick={handleStartCreate}>
              <Plus className="mr-1 h-4 w-4" />
              Nova
            </Button>
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
              placeholder="ID ou nome..."
              aria-label="Pesquisar máquinas por ID ou nome"
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Limpar pesquisa de máquinas"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div
            className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/20 p-1"
            aria-label="Filtrar máquinas por status"
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
                className={cn(
                  "min-h-8 rounded-md px-2 text-[11px] font-bold transition-colors",
                  statusFilter === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Select
            value={workOrderFilter}
            disabled={globalWorkOrderRequirement === null}
            onValueChange={(value) =>
              setWorkOrderFilter(value as "all" | "required" | "optional")
            }
          >
            <SelectTrigger
              aria-label="Filtrar máquinas por exigência de OS"
              className="h-9"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as regras de OS</SelectItem>
              <SelectItem value="required">OS obrigatória</SelectItem>
              <SelectItem value="optional">OS opcional</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
            <span>{filteredMachines.length} de {machines.length} máquina(s)</span>
            {(searchQuery || statusFilter !== "all" || workOrderFilter !== "all") && (
              <button
                type="button"
                className="font-bold text-primary hover:underline"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setWorkOrderFilter("all");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
          {machines.length > 0 && filteredMachines.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
              <p className="text-sm font-bold">Nenhuma máquina encontrada</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ajuste a pesquisa ou os filtros de status e OS.
              </p>
            </div>
          )}

          {filteredMachines.map((machine) => {
            const selected = !creating && selectedMachineId === machine.id;
            return (
              <button
                key={machine.id}
                type="button"
                onClick={() => {
                  setCreating(false);
                  setSelectedMachineId(machine.id);
                }}
                className={cn(
                  "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-transparent hover:border-border hover:bg-accent/60",
                  !machine.isActive && "opacity-65",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{machine.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">ID {machine.id}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
                      machine.isActive
                        ? machine.machineStatus === "stopped"
                          ? "bg-warning/10 text-warning"
                          : "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {machineStatusLabel(machine)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-semibold text-muted-foreground">
                  <span>{productionModeLabel(machine.productionMode)}</span>
                  <span>•</span>
                  <span>{workOrderRuleLabel(machine, globalWorkOrderRequirement)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0">
        {creating ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                  Cadastro
                </p>
                <h3 className="text-xl font-black">Nova máquina</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crie a máquina com os parâmetros essenciais. A hierarquia poderá ser configurada depois.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreating(false);
                  setSelectedMachineId(filteredMachines[0]?.id ?? null);
                }}
              >
                Cancelar
              </Button>
            </div>

            <Section title="Identificação">
              <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                <div className="space-y-1">
                  <Label htmlFor="machine-id">ID</Label>
                  <Input
                    id="machine-id"
                    value={newId}
                    onChange={(event) => setNewId(event.target.value)}
                    placeholder="18"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="machine-name">Nome</Label>
                  <Input
                    id="machine-name"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="Máquina 18"
                  />
                </div>
              </div>
            </Section>

            <Section
              title="Regras operacionais"
              description="Defina o comportamento inicial da máquina no ANDON."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
                  <span>
                    <span className="block text-sm font-bold">Exigir OS nesta máquina</span>
                    <span className="block text-xs text-muted-foreground">
                      {globalRequiresWorkOrder
                        ? "A regra global já exige OS; esta opção registra também a exigência local."
                        : "Quando ativa, exige OS nesta máquina mesmo com a regra global desativada."}
                    </span>
                  </span>
                  <Switch
                    checked={newRequireWorkOrder}
                    onCheckedChange={setNewRequireWorkOrder}
                  />
                </label>

                <div className="space-y-1">
                  <Label>Modo padrão de produção</Label>
                  <Select
                    value={newProductionMode}
                    onValueChange={(value) => setNewProductionMode(value as ProductionMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Programada</SelectItem>
                      <SelectItem value="not_scheduled">Não programada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>

            <div className="flex justify-end">
              <Button type="button" onClick={handleCreate} disabled={!newId.trim()}>
                Criar máquina
              </Button>
            </div>
          </div>
        ) : selectedMachine ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Factory className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                    Máquina {selectedMachine.id}
                  </p>
                  <h3 className="truncate text-xl font-black">{selectedMachine.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Alterações de configuração são aplicadas ao sair do campo ou alterar o controle.
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-black uppercase",
                  selectedMachine.isActive
                    ? "bg-success/10 text-success"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {selectedMachine.isActive ? "Ativa" : "Inativa"}
              </span>
            </div>

            <Section title="Identificação">
              <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
                <div>
                  <Label>ID</Label>
                  <div className="mt-1 flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 font-mono font-bold">
                    {selectedMachine.id}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Nome</Label>
                  <Input
                    key={selectedMachine.id}
                    defaultValue={selectedMachine.name}
                    onBlur={(event) => {
                      const name = event.target.value.trim();
                      if (name && name !== selectedMachine.name) {
                        updateMachineCatalog(selectedMachine.id, { name });
                      }
                    }}
                  />
                </div>
              </div>
            </Section>

            <Section
              title="Regras operacionais"
              description="Configurações que afetam a abertura e operação dos chamados."
            >
              <div className="grid gap-2 rounded-lg border border-border bg-muted/15 p-3 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Regra global de OS
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {globalWorkOrderRequirement === null
                      ? "Não carregada"
                      : globalWorkOrderRequirement
                        ? "Obrigatória"
                        : "Opcional"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Configurada em Configurações gerais.
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Regra desta máquina
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {selectedMachineRequiresWorkOrder ? "Exigência ativa" : "Sem exigência adicional"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    A máquina pode tornar a OS obrigatória mesmo com o global desligado.
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Resultado efetivo
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-sm font-black",
                      selectedEffectiveWorkOrderRequirement === true
                        ? "text-warning"
                        : selectedEffectiveWorkOrderRequirement === false
                          ? "text-success"
                          : "text-muted-foreground",
                    )}
                  >
                    {selectedEffectiveWorkOrderRequirement === null
                      ? "Aguardando regra global"
                      : selectedEffectiveWorkOrderRequirement
                        ? "OS OBRIGATÓRIA"
                        : "OS OPCIONAL"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Regra efetiva = global OU exigência desta máquina.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <label className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border px-3">
                  <span>
                    <span className="block text-sm font-bold">Exigir OS nesta máquina</span>
                    <span className="block text-xs text-muted-foreground">
                      {globalRequiresWorkOrder
                        ? selectedMachineRequiresWorkOrder
                          ? "Exigência local ativa; a regra global também exige OS."
                          : "Mesmo desligada aqui, a regra global mantém a OS obrigatória."
                        : selectedMachineRequiresWorkOrder
                          ? "Ativa: esta máquina exige OS mesmo com o global desativado."
                          : "Desativada: segue o global e a OS permanece opcional."}
                    </span>
                  </span>
                  <Switch
                    checked={selectedMachine.requireWorkOrderAtOpen === true}
                    onCheckedChange={(checked) =>
                      updateMachineCatalog(selectedMachine.id, {
                        requireWorkOrderAtOpen: checked,
                      })
                    }
                  />
                </label>

                <div className="space-y-1">
                  <Label>Modo padrão de produção</Label>
                  <Select
                    value={selectedMachine.productionMode}
                    onValueChange={(value) =>
                      updateMachineCatalog(selectedMachine.id, {
                        productionMode: value as ProductionMode,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Programada</SelectItem>
                      <SelectItem value="not_scheduled">Não programada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border px-3">
                  <span>
                    <span className="block text-sm font-bold">Cadastro ativo</span>
                    <span className="block text-xs text-muted-foreground">
                      {selectedMachine.currentCallId
                        ? "Há chamado ativo; inativação bloqueada."
                        : "Disponível para uso no ANDON."}
                    </span>
                  </span>
                  <Switch
                    checked={selectedMachine.isActive}
                    disabled={Boolean(selectedMachine.currentCallId)}
                    onCheckedChange={(checked) =>
                      updateMachineActive(selectedMachine.id, checked)
                    }
                  />
                </label>
              </div>
            </Section>

            <Section
              title="Estrutura da máquina"
              description="Conjuntos, subconjuntos e ativos vinculados a esta máquina."
            >
              <MachineHierarchyAdminSection machine={selectedMachine} />
            </Section>
          </div>
        ) : (
          <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-border">
            <div className="max-w-sm text-center">
              <Factory className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-black">Nenhuma máquina selecionada</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Selecione uma máquina na lista ou crie um novo cadastro.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
