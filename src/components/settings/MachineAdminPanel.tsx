import { useState } from "react";
import { useAndon } from "@/context/AndonProvider";
import type { Machine, ProductionMode } from "@/types/machine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

export function MachineAdminPanel() {
  const { machines, createMachine, updateMachineCatalog, updateMachineActive } = useAndon();
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newProductionMode, setNewProductionMode] = useState<ProductionMode>("scheduled");

  function handleCreate() {
    const id = newId.trim();
    if (!id) return;
    createMachine({ id, name: newName.trim() || `Máquina ${id}`, productionMode: newProductionMode });
    setNewId("");
    setNewName("");
    setNewProductionMode("scheduled");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cadastro de máquinas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[140px_1fr_220px_auto]">
          <div className="space-y-1">
            <Label htmlFor="machine-id">ID</Label>
            <Input id="machine-id" value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="18" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="machine-name">Nome</Label>
            <Input id="machine-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Máquina 18" />
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

      <div className="space-y-3">
        {sortMachines(machines).map((machine) => (
          <Card key={machine.id} className={!machine.isActive ? "opacity-70" : undefined}>
            <CardContent className="grid gap-3 p-4 md:grid-cols-[90px_1fr_210px_170px_120px] md:items-end">
              <div>
                <Label>ID</Label>
                <div className="text-lg font-bold">{machine.id}</div>
              </div>
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input defaultValue={machine.name} onBlur={(event) => updateMachineCatalog(machine.id, { name: event.target.value })} />
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
