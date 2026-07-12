import { useState } from "react";
import { toast } from "sonner";

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
import {
  createMachineSet,
  createMachineSubset,
  deleteMachineSet,
  deleteMachineSubset,
  listMachineSets,
  listMachineSetTypes,
  listMachineSubsetTypes,
  updateMachineSet,
  updateMachineSubset,
} from "@/services/machineAssetService";
import type { Machine } from "@/types/machine";
import type {
  MachineSet,
  MachineSetDraft,
  MachineSetPatch,
  MachineSetType,
  MachineSubset,
  MachineSubsetDraft,
  MachineSubsetPatch,
  MachineSubsetType,
} from "@/types/machineSet";

type MachineSetFormState = {
  code: string;
  name: string;
  typeId: string;
  description: string;
  displayOrder: string;
  isActive: boolean;
};

type MachineSubsetFormState = {
  code: string;
  name: string;
  typeId: string;
  description: string;
  manufacturer: string;
  model: string;
  assetTag: string;
  displayOrder: string;
  isActive: boolean;
};

function createEmptySetForm(): MachineSetFormState {
  return {
    code: "",
    name: "",
    typeId: "",
    description: "",
    displayOrder: "",
    isActive: true,
  };
}

function createEmptySubsetForm(): MachineSubsetFormState {
  return {
    code: "",
    name: "",
    typeId: "",
    description: "",
    manufacturer: "",
    model: "",
    assetTag: "",
    displayOrder: "",
    isActive: true,
  };
}

function setToForm(set: MachineSet): MachineSetFormState {
  return {
    code: set.code,
    name: set.name,
    typeId: set.typeId ?? "",
    description: set.description ?? "",
    displayOrder:
      set.displayOrder === null
        ? ""
        : String(set.displayOrder),
    isActive: set.isActive,
  };
}

function subsetToForm(
  subset: MachineSubset,
): MachineSubsetFormState {
  return {
    code: subset.code,
    name: subset.name,
    typeId: subset.typeId,
    description: subset.description ?? "",
    manufacturer: subset.manufacturer ?? "",
    model: subset.model ?? "",
    assetTag: subset.assetTag ?? "",
    displayOrder:
      subset.displayOrder === null
        ? ""
        : String(subset.displayOrder),
    isActive: subset.isActive,
  };
}

function parseDisplayOrder(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 0
  ) {
    throw new Error(
      "A ordem deve ser um número inteiro maior ou igual a zero.",
    );
  }

  return parsed;
}

function buildSetDraft(
  form: MachineSetFormState,
): MachineSetDraft {
  const name = form.name.trim();

  if (!name) {
    throw new Error(
      "Informe o nome do conjunto.",
    );
  }

  if (!form.typeId) {
    throw new Error(
      "Selecione o tipo do conjunto.",
    );
  }

  return {
    code: form.code.trim() || undefined,
    name,
    typeId: form.typeId,
    description:
      form.description.trim() || null,
    displayOrder: parseDisplayOrder(
      form.displayOrder,
    ),
    isActive: form.isActive,
  };
}

function buildSetPatch(
  form: MachineSetFormState,
): MachineSetPatch {
  return buildSetDraft(form);
}

function buildSubsetDraft(
  form: MachineSubsetFormState,
): MachineSubsetDraft {
  const name = form.name.trim();

  if (!name) {
    throw new Error(
      "Informe o nome do subconjunto.",
    );
  }

  if (!form.typeId) {
    throw new Error(
      "Selecione o tipo do subconjunto.",
    );
  }

  return {
    code: form.code.trim() || undefined,
    name,
    typeId: form.typeId,
    description:
      form.description.trim() || null,
    manufacturer:
      form.manufacturer.trim() || null,
    model: form.model.trim() || null,
    assetTag: form.assetTag.trim() || null,
    displayOrder: parseDisplayOrder(
      form.displayOrder,
    ),
    isActive: form.isActive,
  };
}

function buildSubsetPatch(
  form: MachineSubsetFormState,
): MachineSubsetPatch {
  return buildSubsetDraft(form);
}

function sortSets(sets: MachineSet[]) {
  return [...sets].sort((a, b) => {
    if (a.isActive !== b.isActive) {
      return a.isActive ? -1 : 1;
    }

    const orderA =
      a.displayOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB =
      b.displayOrder ?? Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return a.name.localeCompare(
      b.name,
      "pt-BR",
      { numeric: true },
    );
  });
}

function sortSubsets(
  subsets: MachineSubset[] = [],
) {
  return [...subsets].sort((a, b) => {
    if (a.isActive !== b.isActive) {
      return a.isActive ? -1 : 1;
    }

    const orderA =
      a.displayOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB =
      b.displayOrder ?? Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return a.name.localeCompare(
      b.name,
      "pt-BR",
      { numeric: true },
    );
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Erro ao processar a operação.";
}

function typeLabel(
  id: string | null,
  types: Array<{
    id: string;
    name: string;
    code: string;
  }>,
  legacyType?: string | null,
) {
  const type = types.find(
    (item) => item.id === id,
  );

  if (type) {
    return type.name;
  }

  return legacyType || "Tipo não vinculado";
}

function SetTypeSelect({
  value,
  types,
  includeInactive,
  onValueChange,
}: {
  value: string;
  types: MachineSetType[];
  includeInactive: boolean;
  onValueChange: (value: string) => void;
}) {
  const options = types.filter(
    (type) =>
      type.isActive ||
      (includeInactive && type.id === value),
  );

  return (
    <Select
      value={value || undefined}
      onValueChange={onValueChange}
    >
      <SelectTrigger>
        <SelectValue placeholder="Selecione o tipo" />
      </SelectTrigger>

      <SelectContent>
        {options.map((type) => (
          <SelectItem
            key={type.id}
            value={type.id}
          >
            {type.name}
            {!type.isActive ? " — inativo" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SubsetTypeSelect({
  value,
  types,
  includeInactive,
  onValueChange,
}: {
  value: string;
  types: MachineSubsetType[];
  includeInactive: boolean;
  onValueChange: (value: string) => void;
}) {
  const options = types.filter(
    (type) =>
      type.isActive ||
      (includeInactive && type.id === value),
  );

  return (
    <Select
      value={value || undefined}
      onValueChange={onValueChange}
    >
      <SelectTrigger>
        <SelectValue placeholder="Selecione o tipo" />
      </SelectTrigger>

      <SelectContent>
        {options.map((type) => (
          <SelectItem
            key={type.id}
            value={type.id}
          >
            {type.name}
            {!type.isActive ? " — inativo" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function MachineHierarchyAdminSection({
  machine,
}: {
  machine: Machine;
}) {
  const [isOpen, setIsOpen] =
    useState(false);

  const [hasLoaded, setHasLoaded] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [sets, setSets] =
    useState<MachineSet[]>([]);

  const [setTypes, setSetTypes] = useState<
    MachineSetType[]
  >([]);

  const [subsetTypes, setSubsetTypes] =
    useState<MachineSubsetType[]>([]);

  const [newSet, setNewSet] =
    useState<MachineSetFormState>(
      createEmptySetForm,
    );

  const [editingSetId, setEditingSetId] =
    useState<string | null>(null);

  const [editSet, setEditSet] =
    useState<MachineSetFormState>(
      createEmptySetForm,
    );

  const [
    expandedSetIds,
    setExpandedSetIds,
  ] = useState<Set<string>>(
    () => new Set(),
  );

  const [
    newSubsetForms,
    setNewSubsetForms,
  ] = useState<
    Record<string, MachineSubsetFormState>
  >({});

  const [
    editingSubsetId,
    setEditingSubsetId,
  ] = useState<string | null>(null);

  const [editSubset, setEditSubset] =
    useState<MachineSubsetFormState>(
      createEmptySubsetForm,
    );

  async function loadHierarchy() {
    setIsLoading(true);

    try {
      const [
        loadedSets,
        loadedSetTypes,
        loadedSubsetTypes,
      ] = await Promise.all([
        listMachineSets(machine.id, {
          includeInactive: true,
          includeSubsets: "list",
        }),
        listMachineSetTypes(true),
        listMachineSubsetTypes(true),
      ]);

      setSets(sortSets(loadedSets));
      setSetTypes(loadedSetTypes);
      setSubsetTypes(loadedSubsetTypes);
      setHasLoaded(true);
    } catch (error) {
      toast.error(
        `Não foi possível carregar a hierarquia da máquina ${machine.id}: ${getErrorMessage(error)}`,
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleHierarchy() {
    const nextOpen = !isOpen;

    setIsOpen(nextOpen);

    if (nextOpen && !hasLoaded) {
      await loadHierarchy();
    }
  }

  function updateNewSet(
    patch: Partial<MachineSetFormState>,
  ) {
    setNewSet((current) => ({
      ...current,
      ...patch,
    }));
  }

  function updateEditSet(
    patch: Partial<MachineSetFormState>,
  ) {
    setEditSet((current) => ({
      ...current,
      ...patch,
    }));
  }

  function getNewSubsetForm(
    setId: string,
  ) {
    return (
      newSubsetForms[setId] ??
      createEmptySubsetForm()
    );
  }

  function updateNewSubset(
    setId: string,
    patch: Partial<MachineSubsetFormState>,
  ) {
    setNewSubsetForms((current) => ({
      ...current,
      [setId]: {
        ...getNewSubsetForm(setId),
        ...patch,
      },
    }));
  }

  function updateEditSubset(
    patch: Partial<MachineSubsetFormState>,
  ) {
    setEditSubset((current) => ({
      ...current,
      ...patch,
    }));
  }

  async function handleCreateSet() {
    try {
      const payload = buildSetDraft(newSet);

      setIsSaving(true);

      await createMachineSet(
        machine.id,
        payload,
      );

      setNewSet(createEmptySetForm());
      await loadHierarchy();

      toast.success("Conjunto criado.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function startEditSet(set: MachineSet) {
    setEditingSetId(set.id);
    setEditSet(setToForm(set));
  }

  function cancelEditSet() {
    setEditingSetId(null);
    setEditSet(createEmptySetForm());
  }

  async function handleSaveSet(
    setId: string,
  ) {
    try {
      const payload = buildSetPatch(editSet);

      setIsSaving(true);

      await updateMachineSet(setId, payload);

      cancelEditSet();
      await loadHierarchy();

      toast.success("Conjunto atualizado.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleSet(
    set: MachineSet,
  ) {
    try {
      setIsSaving(true);

      await updateMachineSet(set.id, {
        isActive: !set.isActive,
      });

      await loadHierarchy();

      toast.success(
        set.isActive
          ? "Conjunto inativado."
          : "Conjunto reativado.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteSet(
    set: MachineSet,
  ) {
    const confirmed = window.confirm(
      `Excluir o conjunto "${set.name}"? Os subconjuntos devem ser tratados antes. Se houver histórico, o conjunto será inativado.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsSaving(true);

      const result = await deleteMachineSet(
        set.id,
      );

      await loadHierarchy();

      toast.success(
        result.deleted
          ? "Conjunto excluído."
          : "Conjunto usado em histórico; foi inativado.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function toggleSetExpansion(setId: string) {
    setExpandedSetIds((current) => {
      const next = new Set(current);

      if (next.has(setId)) {
        next.delete(setId);
      } else {
        next.add(setId);
      }

      return next;
    });
  }

  async function handleCreateSubset(
    set: MachineSet,
  ) {
    try {
      const form = getNewSubsetForm(set.id);
      const payload = buildSubsetDraft(form);

      setIsSaving(true);

      await createMachineSubset(
        set.id,
        payload,
      );

      setNewSubsetForms((current) => {
        const next = { ...current };
        delete next[set.id];
        return next;
      });

      await loadHierarchy();

      toast.success("Subconjunto criado.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function startEditSubset(
    subset: MachineSubset,
  ) {
    setEditingSubsetId(subset.id);
    setEditSubset(subsetToForm(subset));
  }

  function cancelEditSubset() {
    setEditingSubsetId(null);
    setEditSubset(createEmptySubsetForm());
  }

  async function handleSaveSubset(
    subsetId: string,
  ) {
    try {
      const payload =
        buildSubsetPatch(editSubset);

      setIsSaving(true);

      await updateMachineSubset(
        subsetId,
        payload,
      );

      cancelEditSubset();
      await loadHierarchy();

      toast.success("Subconjunto atualizado.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleSubset(
    subset: MachineSubset,
  ) {
    try {
      setIsSaving(true);

      await updateMachineSubset(subset.id, {
        isActive: !subset.isActive,
      });

      await loadHierarchy();

      toast.success(
        subset.isActive
          ? "Subconjunto inativado."
          : "Subconjunto reativado.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteSubset(
    subset: MachineSubset,
  ) {
    const confirmed = window.confirm(
      `Excluir o subconjunto "${subset.name}"? Se houver histórico, ele será apenas inativado.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsSaving(true);

      const result =
        await deleteMachineSubset(
          subset.id,
        );

      await loadHierarchy();

      toast.success(
        result.deleted
          ? "Subconjunto excluído."
          : "Subconjunto usado em histórico; foi inativado.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-muted/20">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
        onClick={() => {
          void toggleHierarchy();
        }}
      >
        <div>
          <h4 className="text-sm font-black uppercase tracking-widest text-foreground">
            Conjuntos e subconjuntos
          </h4>

          <p className="text-xs text-muted-foreground">
            Estrutura técnica da máquina
          </p>
        </div>

        <span className="rounded-md border border-border bg-card px-3 py-1 text-sm font-bold">
          {isOpen ? "Recolher" : "Gerenciar"}
        </span>
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-border p-3">
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void loadHierarchy();
              }}
              disabled={isLoading || isSaving}
            >
              Atualizar hierarquia
            </Button>
          </div>

          {isLoading && !hasLoaded ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Carregando conjuntos e catálogos...
            </div>
          ) : (
            <>
              <div className="space-y-3 rounded-md border border-border bg-card p-3">
                <h5 className="font-black">
                  Novo conjunto
                </h5>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1">
                    <Label>Nome</Label>
                    <Input
                      value={newSet.name}
                      onChange={(event) =>
                        updateNewSet({
                          name: event.target.value,
                        })
                      }
                      placeholder="Maker"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Código</Label>
                    <Input
                      value={newSet.code}
                      onChange={(event) =>
                        updateNewSet({
                          code: event.target.value,
                        })
                      }
                      placeholder="Gerado pelo nome"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Tipo</Label>
                    <SetTypeSelect
                      value={newSet.typeId}
                      types={setTypes}
                      includeInactive={false}
                      onValueChange={(typeId) =>
                        updateNewSet({ typeId })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Ordem</Label>
                    <Input
                      value={newSet.displayOrder}
                      onChange={(event) =>
                        updateNewSet({
                          displayOrder:
                            event.target.value,
                        })
                      }
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Descrição</Label>
                  <Input
                    value={newSet.description}
                    onChange={(event) =>
                      updateNewSet({
                        description:
                          event.target.value,
                      })
                    }
                    placeholder="Descrição opcional"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newSet.isActive}
                      onCheckedChange={(isActive) =>
                        updateNewSet({ isActive })
                      }
                    />

                    <span className="text-sm font-bold">
                      Criar como ativo
                    </span>
                  </div>

                  <Button
                    type="button"
                    onClick={() => {
                      void handleCreateSet();
                    }}
                    disabled={
                      isSaving ||
                      isLoading ||
                      setTypes.filter(
                        (type) => type.isActive,
                      ).length === 0
                    }
                  >
                    Adicionar conjunto
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {sets.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Nenhum conjunto cadastrado.
                  </div>
                ) : (
                  sets.map((set) => {
                    const isEditing =
                      editingSetId === set.id;

                    const isExpanded =
                      expandedSetIds.has(set.id);

                    const subsets = sortSubsets(
                      set.subsets,
                    );

                    const newSubset =
                      getNewSubsetForm(set.id);

                    return (
                      <div
                        key={set.id}
                        className={
                          set.isActive
                            ? "rounded-lg border border-border bg-card"
                            : "rounded-lg border border-border bg-card opacity-65"
                        }
                      >
                        <div className="p-3">
                          {isEditing ? (
                            <div className="space-y-3">
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <div className="space-y-1">
                                  <Label>Nome</Label>
                                  <Input
                                    value={
                                      editSet.name
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      updateEditSet({
                                        name: event
                                          .target
                                          .value,
                                      })
                                    }
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label>Código</Label>
                                  <Input
                                    value={
                                      editSet.code
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      updateEditSet({
                                        code: event
                                          .target
                                          .value,
                                      })
                                    }
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label>Tipo</Label>
                                  <SetTypeSelect
                                    value={
                                      editSet.typeId
                                    }
                                    types={setTypes}
                                    includeInactive
                                    onValueChange={(
                                      typeId,
                                    ) =>
                                      updateEditSet({
                                        typeId,
                                      })
                                    }
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label>Ordem</Label>
                                  <Input
                                    value={
                                      editSet.displayOrder
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      updateEditSet({
                                        displayOrder:
                                          event.target
                                            .value,
                                      })
                                    }
                                    inputMode="numeric"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <Label>Descrição</Label>
                                <Input
                                  value={
                                    editSet.description
                                  }
                                  onChange={(event) =>
                                    updateEditSet({
                                      description:
                                        event.target
                                          .value,
                                    })
                                  }
                                />
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    void handleSaveSet(
                                      set.id,
                                    );
                                  }}
                                  disabled={isSaving}
                                >
                                  Salvar
                                </Button>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={
                                    cancelEditSet
                                  }
                                  disabled={isSaving}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-black">
                                    {set.name}
                                  </span>

                                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">
                                    {set.isActive
                                      ? "Ativo"
                                      : "Inativo"}
                                  </span>

                                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                                    {typeLabel(
                                      set.typeId,
                                      setTypes,
                                      set.type,
                                    )}
                                  </span>
                                </div>

                                <div className="mt-1 text-xs text-muted-foreground">
                                  Código:{" "}
                                  <span className="font-mono font-bold text-foreground">
                                    {set.code}
                                  </span>
                                  {" • "}
                                  Subconjuntos:{" "}
                                  {subsets.length}
                                </div>

                                {set.description && (
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {set.description}
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    startEditSet(set)
                                  }
                                  disabled={isSaving}
                                >
                                  Editar
                                </Button>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    void handleToggleSet(
                                      set,
                                    );
                                  }}
                                  disabled={isSaving}
                                >
                                  {set.isActive
                                    ? "Inativar"
                                    : "Reativar"}
                                </Button>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    void handleDeleteSet(
                                      set,
                                    );
                                  }}
                                  disabled={isSaving}
                                >
                                  Excluir
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          className="flex w-full items-center justify-between border-t border-border px-3 py-2 text-left text-sm font-bold"
                          onClick={() =>
                            toggleSetExpansion(
                              set.id,
                            )
                          }
                        >
                          <span>
                            Subconjuntos do conjunto
                          </span>

                          <span>
                            {isExpanded
                              ? "Recolher"
                              : "Expandir"}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="space-y-3 border-t border-border bg-muted/20 p-3">
                            {set.isActive && (
                              <div className="space-y-3 rounded-md border border-border bg-card p-3">
                                <h6 className="font-black">
                                  Novo subconjunto
                                </h6>

                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                  <div className="space-y-1">
                                    <Label>Nome</Label>
                                    <Input
                                      value={
                                        newSubset.name
                                      }
                                      onChange={(
                                        event,
                                      ) =>
                                        updateNewSubset(
                                          set.id,
                                          {
                                            name: event
                                              .target
                                              .value,
                                          },
                                        )
                                      }
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <Label>Código</Label>
                                    <Input
                                      value={
                                        newSubset.code
                                      }
                                      onChange={(
                                        event,
                                      ) =>
                                        updateNewSubset(
                                          set.id,
                                          {
                                            code: event
                                              .target
                                              .value,
                                          },
                                        )
                                      }
                                      placeholder="Gerado pelo nome"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <Label>Tipo</Label>
                                    <SubsetTypeSelect
                                      value={
                                        newSubset.typeId
                                      }
                                      types={
                                        subsetTypes
                                      }
                                      includeInactive={
                                        false
                                      }
                                      onValueChange={(
                                        typeId,
                                      ) =>
                                        updateNewSubset(
                                          set.id,
                                          { typeId },
                                        )
                                      }
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <Label>Ordem</Label>
                                    <Input
                                      value={
                                        newSubset.displayOrder
                                      }
                                      onChange={(
                                        event,
                                      ) =>
                                        updateNewSubset(
                                          set.id,
                                          {
                                            displayOrder:
                                              event
                                                .target
                                                .value,
                                          },
                                        )
                                      }
                                      inputMode="numeric"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <Label>Fabricante</Label>
                                    <Input
                                      value={
                                        newSubset.manufacturer
                                      }
                                      onChange={(
                                        event,
                                      ) =>
                                        updateNewSubset(
                                          set.id,
                                          {
                                            manufacturer:
                                              event
                                                .target
                                                .value,
                                          },
                                        )
                                      }
                                      placeholder="WEG"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <Label>Modelo</Label>
                                    <Input
                                      value={
                                        newSubset.model
                                      }
                                      onChange={(
                                        event,
                                      ) =>
                                        updateNewSubset(
                                          set.id,
                                          {
                                            model: event
                                              .target
                                              .value,
                                          },
                                        )
                                      }
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <Label>TAG</Label>
                                    <Input
                                      value={
                                        newSubset.assetTag
                                      }
                                      onChange={(
                                        event,
                                      ) =>
                                        updateNewSubset(
                                          set.id,
                                          {
                                            assetTag:
                                              event
                                                .target
                                                .value,
                                          },
                                        )
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <Label>Descrição</Label>
                                  <Input
                                    value={
                                      newSubset.description
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      updateNewSubset(
                                        set.id,
                                        {
                                          description:
                                            event.target
                                              .value,
                                        },
                                      )
                                    }
                                  />
                                </div>

                                <div className="flex justify-end">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                      void handleCreateSubset(
                                        set,
                                      );
                                    }}
                                    disabled={
                                      isSaving ||
                                      subsetTypes.filter(
                                        (type) =>
                                          type.isActive,
                                      ).length === 0
                                    }
                                  >
                                    Adicionar subconjunto
                                  </Button>
                                </div>
                              </div>
                            )}

                            {subsets.length === 0 ? (
                              <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                                Nenhum subconjunto cadastrado.
                              </div>
                            ) : (
                              subsets.map((subset) => {
                                const isSubsetEditing =
                                  editingSubsetId ===
                                  subset.id;

                                return (
                                  <div
                                    key={subset.id}
                                    className={
                                      subset.isActive
                                        ? "rounded-md border border-border bg-card p-3"
                                        : "rounded-md border border-border bg-card p-3 opacity-65"
                                    }
                                  >
                                    {isSubsetEditing ? (
                                      <div className="space-y-3">
                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                          <div className="space-y-1">
                                            <Label>Nome</Label>
                                            <Input
                                              value={
                                                editSubset.name
                                              }
                                              onChange={(
                                                event,
                                              ) =>
                                                updateEditSubset(
                                                  {
                                                    name: event
                                                      .target
                                                      .value,
                                                  },
                                                )
                                              }
                                            />
                                          </div>

                                          <div className="space-y-1">
                                            <Label>Código</Label>
                                            <Input
                                              value={
                                                editSubset.code
                                              }
                                              onChange={(
                                                event,
                                              ) =>
                                                updateEditSubset(
                                                  {
                                                    code: event
                                                      .target
                                                      .value,
                                                  },
                                                )
                                              }
                                            />
                                          </div>

                                          <div className="space-y-1">
                                            <Label>Tipo</Label>
                                            <SubsetTypeSelect
                                              value={
                                                editSubset.typeId
                                              }
                                              types={
                                                subsetTypes
                                              }
                                              includeInactive
                                              onValueChange={(
                                                typeId,
                                              ) =>
                                                updateEditSubset(
                                                  {
                                                    typeId,
                                                  },
                                                )
                                              }
                                            />
                                          </div>

                                          <div className="space-y-1">
                                            <Label>Ordem</Label>
                                            <Input
                                              value={
                                                editSubset.displayOrder
                                              }
                                              onChange={(
                                                event,
                                              ) =>
                                                updateEditSubset(
                                                  {
                                                    displayOrder:
                                                      event
                                                        .target
                                                        .value,
                                                  },
                                                )
                                              }
                                              inputMode="numeric"
                                            />
                                          </div>

                                          <div className="space-y-1">
                                            <Label>Fabricante</Label>
                                            <Input
                                              value={
                                                editSubset.manufacturer
                                              }
                                              onChange={(
                                                event,
                                              ) =>
                                                updateEditSubset(
                                                  {
                                                    manufacturer:
                                                      event
                                                        .target
                                                        .value,
                                                  },
                                                )
                                              }
                                            />
                                          </div>

                                          <div className="space-y-1">
                                            <Label>Modelo</Label>
                                            <Input
                                              value={
                                                editSubset.model
                                              }
                                              onChange={(
                                                event,
                                              ) =>
                                                updateEditSubset(
                                                  {
                                                    model: event
                                                      .target
                                                      .value,
                                                  },
                                                )
                                              }
                                            />
                                          </div>

                                          <div className="space-y-1">
                                            <Label>TAG</Label>
                                            <Input
                                              value={
                                                editSubset.assetTag
                                              }
                                              onChange={(
                                                event,
                                              ) =>
                                                updateEditSubset(
                                                  {
                                                    assetTag:
                                                      event
                                                        .target
                                                        .value,
                                                  },
                                                )
                                              }
                                            />
                                          </div>
                                        </div>

                                        <div className="space-y-1">
                                          <Label>Descrição</Label>
                                          <Input
                                            value={
                                              editSubset.description
                                            }
                                            onChange={(
                                              event,
                                            ) =>
                                              updateEditSubset(
                                                {
                                                  description:
                                                    event
                                                      .target
                                                      .value,
                                                },
                                              )
                                            }
                                          />
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                          <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => {
                                              void handleSaveSubset(
                                                subset.id,
                                              );
                                            }}
                                            disabled={
                                              isSaving
                                            }
                                          >
                                            Salvar
                                          </Button>

                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={
                                              cancelEditSubset
                                            }
                                            disabled={
                                              isSaving
                                            }
                                          >
                                            Cancelar
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-black">
                                              {
                                                subset.name
                                              }
                                            </span>

                                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">
                                              {subset.isActive
                                                ? "Ativo"
                                                : "Inativo"}
                                            </span>

                                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                                              {typeLabel(
                                                subset.typeId,
                                                subsetTypes,
                                              )}
                                            </span>
                                          </div>

                                          <div className="mt-1 text-xs text-muted-foreground">
                                            Código:{" "}
                                            <span className="font-mono font-bold text-foreground">
                                              {
                                                subset.code
                                              }
                                            </span>
                                            {subset.manufacturer
                                              ? ` • Fabricante: ${subset.manufacturer}`
                                              : ""}
                                            {subset.model
                                              ? ` • Modelo: ${subset.model}`
                                              : ""}
                                            {subset.assetTag
                                              ? ` • TAG: ${subset.assetTag}`
                                              : ""}
                                          </div>

                                          {subset.description && (
                                            <p className="mt-1 text-sm text-muted-foreground">
                                              {
                                                subset.description
                                              }
                                            </p>
                                          )}
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                              startEditSubset(
                                                subset,
                                              )
                                            }
                                            disabled={
                                              isSaving
                                            }
                                          >
                                            Editar
                                          </Button>

                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => {
                                              void handleToggleSubset(
                                                subset,
                                              );
                                            }}
                                            disabled={
                                              isSaving
                                            }
                                          >
                                            {subset.isActive
                                              ? "Inativar"
                                              : "Reativar"}
                                          </Button>

                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => {
                                              void handleDeleteSubset(
                                                subset,
                                              );
                                            }}
                                            disabled={
                                              isSaving
                                            }
                                          >
                                            Excluir
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}