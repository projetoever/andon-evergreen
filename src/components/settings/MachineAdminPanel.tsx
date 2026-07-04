import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAndon } from "@/context/AndonProvider";
import type { Machine, ProductionMode } from "@/types/machine";
import type { MachineSet } from "@/types/machineSet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ADMIN_PASSWORD_MIN_LENGTH, changeAdminPassword } from "@/services/adminAuthService";
import { createAndonApiClient } from "@/api/andonApiClient";

const andonApiClient = createAndonApiClient();

type MachineSetFormState = {
  code: string;
  name: string;
  type: string;
  description: string;
  displayOrder: string;
  isActive: boolean;
};

function createEmptyMachineSetForm(): MachineSetFormState {
  return {
    code: "",
    name: "",
    type: "",
    description: "",
    displayOrder: "",
    isActive: true,
  };
}

function machineSetToForm(set: MachineSet): MachineSetFormState {
  return {
    code: set.code,
    name: set.name,
    type: set.type ?? "",
    description: set.description ?? "",
    displayOrder: set.displayOrder === null || set.displayOrder === undefined ? "" : String(set.displayOrder),
    isActive: set.isActive,
  };
}

function buildMachineSetPayload(form: MachineSetFormState) {
  const displayOrder = form.displayOrder.trim() ? Number(form.displayOrder) : null;

  if (form.displayOrder.trim() && !Number.isFinite(displayOrder)) {
    throw new Error("Ordem precisa ser um número válido.");
  }

  return {
    code: form.code.trim(),
    name: form.name.trim(),
    type: form.type.trim() || null,
    description: form.description.trim() || null,
    displayOrder,
    isActive: form.isActive,
  };
}

function sortMachines(machines: Machine[]) {
  return [...machines].sort((a, b) => {
    const orderA = a.displayOrder ?? Number(a.id);
    const orderB = b.displayOrder ?? Number(b.id);
    if (Number.isFinite(orderA) && Number.isFinite(orderB)) return orderA - orderB;
    return a.name.localeCompare(b.name, "pt-BR", { numeric: true });
  });
}

function sortMachineSets(sets: MachineSet[]) {
  return [...sets].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name, "pt-BR", { numeric: true });
  });
}

function productionModeLabel(mode: ProductionMode) {
  return mode === "scheduled" ? "Programada" : "Não programada";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro ao processar operação.";
}

function AdminPasswordPanel() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function handleChangePassword() {
    if (newPassword.trim() !== confirmPassword.trim()) {
      toast.error("A confirmação não confere com a nova senha.");
      return;
    }

    const result = changeAdminPassword(currentPassword, newPassword);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success(result.message);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Senha administrativa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          A senha padrão de instalação é 123456. Após alterar, use a nova senha para acessar o painel administrativo e desbloquear telas fixadas.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="current-admin-password">Senha atual</Label>
            <Input
              id="current-admin-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Senha atual"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-admin-password">Nova senha</Label>
            <Input
              id="new-admin-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder={`Mínimo ${ADMIN_PASSWORD_MIN_LENGTH} caracteres`}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm-admin-password">Confirmar nova senha</Label>
            <Input
              id="confirm-admin-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repita a nova senha"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={handleChangePassword}>Alterar senha</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MachineSetsAdminSection({ machine }: { machine: Machine }) {
  const [sets, setSets] = useState<MachineSet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newSet, setNewSet] = useState<MachineSetFormState>(createEmptyMachineSetForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSet, setEditSet] = useState<MachineSetFormState>(createEmptyMachineSetForm);

  async function loadSets() {
    setIsLoading(true);
    try {
      const loaded = await andonApiClient.get<MachineSet[]>(`/api/machines/${encodeURIComponent(machine.id)}/sets?includeInactive=true`);
      setSets(sortMachineSets(loaded));
    } catch (error) {
      toast.error(`Não foi possível carregar os conjuntos da máquina ${machine.id}: ${getErrorMessage(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.id]);

  function updateNewSet(patch: Partial<MachineSetFormState>) {
    setNewSet((current) => ({ ...current, ...patch }));
  }

  function updateEditSet(patch: Partial<MachineSetFormState>) {
    setEditSet((current) => ({ ...current, ...patch }));
  }

  async function handleCreateSet() {
    try {
      const payload = buildMachineSetPayload(newSet);
      if (!payload.name) {
        toast.error("Informe o nome do conjunto.");
        return;
      }

      setIsSaving(true);
      await andonApiClient.post<MachineSet>(`/api/machines/${encodeURIComponent(machine.id)}/sets`, payload);
      setNewSet(createEmptyMachineSetForm());
      await loadSets();
      toast.success(`Conjunto criado para a máquina ${machine.id}.`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(set: MachineSet) {
    setEditingId(set.id);
    setEditSet(machineSetToForm(set));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditSet(createEmptyMachineSetForm());
  }

  async function handleSaveSet(setId: string) {
    try {
      const payload = buildMachineSetPayload(editSet);
      if (!payload.name) {
        toast.error("Informe o nome do conjunto.");
        return;
      }

      setIsSaving(true);
      await andonApiClient.patch<MachineSet>(`/api/machine-sets/${encodeURIComponent(setId)}`, payload);
      cancelEdit();
      await loadSets();
      toast.success("Conjunto atualizado.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(set: MachineSet) {
    try {
      setIsSaving(true);
      await andonApiClient.patch<MachineSet>(`/api/machine-sets/${encodeURIComponent(set.id)}`, { isActive: !set.isActive });
      await loadSets();
      toast.success(set.isActive ? "Conjunto inativado." : "Conjunto reativado.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteSet(set: MachineSet) {
    const confirmed = window.confirm(
      `Excluir o conjunto "${set.name}"? Se ele já tiver sido usado em chamado, será apenas inativado para preservar o histórico.`,
    );
    if (!confirmed) return;

    try {
      setIsSaving(true);
      const result = await andonApiClient.request<{ deleted: boolean; inactivated: boolean }>(
        `/api/machine-sets/${encodeURIComponent(set.id)}`,
        { method: "DELETE" },
      );
      await loadSets();
      toast.success(result.deleted ? "Conjunto excluído." : "Conjunto já usado em histórico; foi inativado.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-black uppercase tracking-widest text-foreground">Conjuntos da máquina</h4>
          <p className="text-xs text-muted-foreground">Use para Maker, Bagger, Filtro, Esteira, Dosador e outros pontos de falha.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={loadSets} disabled={isLoading || isSaving}>
          Atualizar
        </Button>
      </div>

      <div className="grid gap-2 rounded-md border border-border bg-card p-3 md:grid-cols-[1fr_1fr_1fr_110px_auto] md:items-end">
        <div className="space-y-1">
          <Label>Nome</Label>
          <Input value={newSet.name} onChange={(event) => updateNewSet({ name: event.target.value })} placeholder="Maker" />
        </div>
        <div className="space-y-1">
          <Label>Código</Label>
          <Input value={newSet.code} onChange={(event) => updateNewSet({ code: event.target.value })} placeholder="maker" />
        </div>
        <div className="space-y-1">
          <Label>Tipo</Label>
          <Input value={newSet.type} onChange={(event) => updateNewSet({ type: event.target.value })} placeholder="maker / bagger / filtro" />
        </div>
        <div className="space-y-1">
          <Label>Ordem</Label>
          <Input value={newSet.displayOrder} onChange={(event) => updateNewSet({ displayOrder: event.target.value })} placeholder="1" inputMode="numeric" />
        </div>
        <Button type="button" onClick={handleCreateSet} disabled={isSaving || isLoading}>
          Adicionar
        </Button>
        <div className="space-y-1 md:col-span-5">
          <Label>Descrição</Label>
          <Input value={newSet.description} onChange={(event) => updateNewSet({ description: event.target.value })} placeholder="Opcional" />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">Carregando conjuntos...</div>
        ) : sets.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">Nenhum conjunto cadastrado para esta máquina.</div>
        ) : (
          sets.map((set) => {
            const isEditing = editingId === set.id;
            return (
              <div key={set.id} className={!set.isActive ? "rounded-md border border-border bg-card p-3 opacity-60" : "rounded-md border border-border bg-card p-3"}>
                {isEditing ? (
                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_110px]">
                    <div className="space-y-1">
                      <Label>Nome</Label>
                      <Input value={editSet.name} onChange={(event) => updateEditSet({ name: event.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Código</Label>
                      <Input value={editSet.code} onChange={(event) => updateEditSet({ code: event.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Tipo</Label>
                      <Input value={editSet.type} onChange={(event) => updateEditSet({ type: event.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Ordem</Label>
                      <Input value={editSet.displayOrder} onChange={(event) => updateEditSet({ displayOrder: event.target.value })} inputMode="numeric" />
                    </div>
                    <div className="space-y-1 md:col-span-4">
                      <Label>Descrição</Label>
                      <Input value={editSet.description} onChange={(event) => updateEditSet({ description: event.target.value })} />
                    </div>
                    <div className="flex flex-wrap gap-2 md:col-span-4">
                      <Button type="button" size="sm" onClick={() => handleSaveSet(set.id)} disabled={isSaving}>Salvar</Button>
                      <Button type="button" size="sm" variant="outline" onClick={cancelEdit} disabled={isSaving}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-foreground">{set.name}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">{set.isActive ? "Ativo" : "Inativo"}</span>
                        {set.type && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{set.type}</span>}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Código: <span className="font-mono font-bold text-foreground">{set.code}</span>
                        {set.displayOrder !== null && set.displayOrder !== undefined ? ` • Ordem: ${set.displayOrder}` : ""}
                      </div>
                      {set.description && <div className="mt-1 text-sm text-muted-foreground">{set.description}</div>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startEdit(set)} disabled={isSaving}>Editar</Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => handleToggleActive(set)} disabled={isSaving}>
                        {set.isActive ? "Inativar" : "Reativar"}
                      </Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => handleDeleteSet(set)} disabled={isSaving}>Excluir</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
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
      <AdminPasswordPanel />

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
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 md:grid-cols-[90px_1fr_210px_170px_120px] md:items-end">
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
              </div>

              <MachineSetsAdminSection machine={machine} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
