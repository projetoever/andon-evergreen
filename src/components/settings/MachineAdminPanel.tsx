import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useAndon } from "@/context/AndonProvider";
import type { Machine, ProductionMode } from "@/types/machine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MachineHierarchyAdminSection } from "./MachineHierarchyAdminSection";
import { filterMachinesForAdmin } from "@/utils/adminEntityFilterUtils";

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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro ao processar operação.";
}

export function MachineAdminPanel() {
  const { machines, createMachine, updateMachineCatalog, updateMachineActive } = useAndon();
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newProductionMode, setNewProductionMode] = useState<ProductionMode>("scheduled");
  const [newRequireWorkOrder, setNewRequireWorkOrder] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMachines = useMemo(
    () => filterMachinesForAdmin(sortMachines(machines), searchQuery),
    [machines, searchQuery],
  );

  function handleCreate() {
    const id = newId.trim();
    if (!id) return;
    createMachine({
      id,
      name: newName.trim() || `Máquina ${id}`,
      productionMode: newProductionMode,
      requireWorkOrderAtOpen: newRequireWorkOrder,
    });
    setNewId("");
    setNewName("");
    setNewProductionMode("scheduled");
    setNewRequireWorkOrder(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cadastro de máquinas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[140px_1fr_220px_220px_auto]">
          <div className="space-y-1">
            <Label htmlFor="machine-id">ID</Label>
            <Input id="machine-id" value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="18" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="machine-name">Nome</Label>
            <Input id="machine-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Máquina 18" />
          </div>
          <div className="flex items-center gap-2 self-end pb-2">
            <Switch checked={newRequireWorkOrder} onCheckedChange={setNewRequireWorkOrder} />
            <span className="text-sm font-bold">Exigir OS</span>
          </div>
          <div className="space-y-1">
            <Label>Modo padrão</Label>
            <Select value={newProductionMode} onValueChange={(value) => setNewProductionMode(value as ProductionMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Programada</SelectItem>
                <SelectItem value="not_scheduled">Não programada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" className="self-end" onClick={handleCreate}>Criar máquina</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-xl">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Pesquisar por ID ou nome da máquina..."
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
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">
              {filteredMachines.length} de {machines.length} máquina(s)
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {machines.length > 0 && filteredMachines.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm font-bold text-foreground">Nenhuma máquina encontrada</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pesquise pelo ID ou por parte do nome da máquina.
              </p>
            </CardContent>
          </Card>
        )}
        {filteredMachines.map((machine) => (
          <Card key={machine.id} className={!machine.isActive ? "opacity-70" : undefined}>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 md:grid-cols-[90px_1fr_210px_190px_170px_120px] md:items-end">
                <div>
                  <Label>ID</Label>
                  <div className="text-lg font-bold">{machine.id}</div>
                </div>
                <div className="space-y-1">
                  <Label>Nome</Label>
                  <Input defaultValue={machine.name} onBlur={(event) => updateMachineCatalog(machine.id, { name: event.target.value })} />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch
                    checked={machine.requireWorkOrderAtOpen === true}
                    onCheckedChange={(checked) =>
                      updateMachineCatalog(machine.id, { requireWorkOrderAtOpen: checked })
                    }
                  />
                  <span className="text-sm font-bold">Exigir OS</span>
                </div>
                <div className="space-y-1">
                  <Label>Modo padrão</Label>
                  <Select value={machine.productionMode} onValueChange={(value) => updateMachineCatalog(machine.id, { productionMode: value as ProductionMode })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Programada</SelectItem>
                      <SelectItem value="not_scheduled">Não programada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-sm font-semibold uppercase text-muted-foreground">
                  <div>Máquina: {machine.machineStatus}</div>
                  <div>ANDON: {machine.andonStatus}</div>
                  <div>{productionModeLabel(machine.productionMode)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={machine.isActive} disabled={Boolean(machine.currentCallId)} onCheckedChange={(checked) => updateMachineActive(machine.id, checked)} />
                  <span className="text-sm font-bold">{machine.isActive ? "Ativa" : "Inativa"}</span>
                </div>
              </div>

              <MachineHierarchyAdminSection machine={machine} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
