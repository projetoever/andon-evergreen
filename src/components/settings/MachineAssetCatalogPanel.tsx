import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import { AndonApiError } from "@/api/andonApiClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  createMachineSetType,
  createMachineSubsetType,
  deleteMachineSetType,
  deleteMachineSubsetType,
  listMachineSetTypes,
  listMachineSubsetTypes,
  updateMachineSetType,
  updateMachineSubsetType,
} from "@/services/machineAssetService";
import { getSystemSettings, updateSystemSettings } from "@/services/systemSettingsService";
import type {
  MachineAssetCatalogItem,
  MachineCatalogDraft,
  MachineCatalogPatch,
  MachineSetType,
  MachineSubsetType,
} from "@/types/machineSet";
import type { SystemSettings } from "@/types/systemSettings";

type CatalogKind = "set" | "subset";

type CatalogFormState = {
  code: string;
  name: string;
  description: string;
  displayOrder: string;
  isActive: boolean;
};

function createEmptyForm(): CatalogFormState {
  return {
    code: "",
    name: "",
    description: "",
    displayOrder: "0",
    isActive: true,
  };
}

function catalogToForm(
  item: MachineAssetCatalogItem,
): CatalogFormState {
  return {
    code: item.code,
    name: item.name,
    description: item.description ?? "",
    displayOrder: String(item.displayOrder),
    isActive: item.isActive,
  };
}

function buildCatalogPayload(
  form: CatalogFormState,
): MachineCatalogDraft {
  const name = form.name.trim();

  if (!name) {
    throw new Error("Informe o nome do tipo de ativo.");
  }

  const displayOrderText =
    form.displayOrder.trim();

  const displayOrder = displayOrderText
    ? Number(displayOrderText)
    : 0;

  if (
    !Number.isInteger(displayOrder) ||
    displayOrder < 0
  ) {
    throw new Error(
      "A ordem deve ser um número inteiro maior ou igual a zero.",
    );
  }

  return {
    code: form.code.trim() || undefined,
    name,
    description:
      form.description.trim() || null,
    displayOrder,
    isActive: form.isActive,
  };
}

function sortCatalogItems<
  T extends MachineAssetCatalogItem,
>(items: T[]) {
  return [...items].sort((a, b) => {
    if (a.isActive !== b.isActive) {
      return a.isActive ? -1 : 1;
    }

    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }

    return a.name.localeCompare(
      b.name,
      "pt-BR",
      {
        numeric: true,
      },
    );
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Erro ao processar o catálogo.";
}

export function MachineAssetCatalogPanel() {
  const [catalogKind, setCatalogKind] =
    useState<CatalogKind>("set");

  const [setTypes, setSetTypes] = useState<
    MachineSetType[]
  >([]);

  const [subsetTypes, setSubsetTypes] =
    useState<MachineSubsetType[]>([]);

  const [isLoading, setIsLoading] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);

  const [isLoadingPolicy, setIsLoadingPolicy] = useState(false);

  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  const [newForm, setNewForm] =
    useState<CatalogFormState>(
      createEmptyForm,
    );

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [editForm, setEditForm] =
    useState<CatalogFormState>(
      createEmptyForm,
    );

  const [lockedCodeIds, setLockedCodeIds] =
    useState<Set<string>>(
      () => new Set(),
    );

  const items = useMemo(
    () =>
      catalogKind === "set"
        ? sortCatalogItems(setTypes)
        : sortCatalogItems(subsetTypes),
    [catalogKind, setTypes, subsetTypes],
  );

  const catalogTitle =
    catalogKind === "set"
      ? "Tipos de conjunto"
      : "Tipos de subconjunto";

  const catalogDescription =
    catalogKind === "set"
      ? "Cadastre tipos reutilizáveis como Maker, Bagger, Filtro, Esteira e Dosador."
      : "Cadastre tipos reutilizáveis para componentes internos, módulos e pontos específicos do conjunto.";

  async function loadCatalogs() {
    setIsLoading(true);

    try {
      const [
        loadedSetTypes,
        loadedSubsetTypes,
      ] = await Promise.all([
        listMachineSetTypes(true),
        listMachineSubsetTypes(true),
      ]);

      setSetTypes(loadedSetTypes);
      setSubsetTypes(loadedSubsetTypes);
    } catch (error) {
      toast.error(
        `Não foi possível carregar os catálogos: ${getErrorMessage(error)}`,
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSelectionPolicy() {
    setIsLoadingPolicy(true);

    try {
      setSystemSettings(await getSystemSettings());
    } catch (error) {
      toast.error(`Não foi possível carregar a política de abertura: ${getErrorMessage(error)}`);
    } finally {
      setIsLoadingPolicy(false);
    }
  }

  useEffect(() => {
    void loadCatalogs();
    void loadSelectionPolicy();
  }, []);

  useEffect(() => {
    setNewForm(createEmptyForm());
    setEditingId(null);
    setEditForm(createEmptyForm());
  }, [catalogKind]);

  function updateNewForm(
    patch: Partial<CatalogFormState>,
  ) {
    setNewForm((current) => ({
      ...current,
      ...patch,
    }));
  }

  function updateEditForm(
    patch: Partial<CatalogFormState>,
  ) {
    setEditForm((current) => ({
      ...current,
      ...patch,
    }));
  }

  async function createCurrentCatalog(
    draft: MachineCatalogDraft,
  ) {
    if (catalogKind === "set") {
      return createMachineSetType(draft);
    }

    return createMachineSubsetType(draft);
  }

  async function updateCurrentCatalog(
    id: string,
    patch: MachineCatalogPatch,
  ) {
    if (catalogKind === "set") {
      return updateMachineSetType(
        id,
        patch,
      );
    }

    return updateMachineSubsetType(
      id,
      patch,
    );
  }

  async function deleteCurrentCatalog(
    id: string,
  ) {
    if (catalogKind === "set") {
      return deleteMachineSetType(id);
    }

    return deleteMachineSubsetType(id);
  }

  async function handleCreate() {
    try {
      const payload =
        buildCatalogPayload(newForm);

      setIsSaving(true);

      await createCurrentCatalog(payload);

      setNewForm(createEmptyForm());
      await loadCatalogs();

      toast.success(
        `${catalogTitle.slice(0, -1)} criado com sucesso.`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(
    item: MachineAssetCatalogItem,
  ) {
    setEditingId(item.id);
    setEditForm(catalogToForm(item));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(createEmptyForm());
  }

  async function handleSave(
    item: MachineAssetCatalogItem,
  ) {
    try {
      const payload =
        buildCatalogPayload(editForm);

      setIsSaving(true);

      await updateCurrentCatalog(
        item.id,
        payload,
      );

      cancelEdit();
      await loadCatalogs();

      toast.success(
        "Tipo de ativo atualizado.",
      );
    } catch (error) {
      if (
        error instanceof AndonApiError &&
        error.status === 409
      ) {
        setLockedCodeIds(
          (current) => {
            const next = new Set(current);
            next.add(item.id);
            return next;
          },
        );
      }

      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(
    item: MachineAssetCatalogItem,
  ) {
    try {
      setIsSaving(true);

      await updateCurrentCatalog(
        item.id,
        {
          isActive: !item.isActive,
        },
      );

      await loadCatalogs();

      toast.success(
        item.isActive
          ? "Tipo de ativo inativado."
          : "Tipo de ativo reativado.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(
    item: MachineAssetCatalogItem,
  ) {
    const confirmed = window.confirm(
      `Excluir o tipo "${item.name}"? Se ele já estiver em uso, será apenas inativado para preservar os cadastros existentes.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsSaving(true);

      const result =
        await deleteCurrentCatalog(
          item.id,
        );

      await loadCatalogs();

      toast.success(
        result.deleted
          ? "Tipo de ativo excluído."
          : "Tipo em uso; o registro foi inativado.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleWholeSetPolicyChange(allowWholeSetCalls: boolean) {
    try {
      setIsSavingPolicy(true);

      const updatedSettings = await updateSystemSettings({
        allowWholeSetCalls,
      });

      setSystemSettings(updatedSettings);
      toast.success(
        allowWholeSetCalls
          ? "Chamados no conjunto inteiro foram habilitados."
          : "Equipamento obrigatório quando houver opções ativas.",
      );
    } catch (error) {
      toast.error(`Não foi possível atualizar a política: ${getErrorMessage(error)}`);
    } finally {
      setIsSavingPolicy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Política de abertura de chamados</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <Label htmlFor="allow-whole-set-calls" className="text-base font-black">
                Permitir chamados no conjunto inteiro
              </Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Quando desativada, o operador deve escolher um equipamento ou subconjunto ativo. Se
                o conjunto não possuir nenhum, o chamado continua permitido para o conjunto inteiro.
              </p>
            </div>

            <Switch
              id="allow-whole-set-calls"
              checked={systemSettings?.allowWholeSetCalls ?? true}
              onCheckedChange={handleWholeSetPolicyChange}
              disabled={!systemSettings || isLoadingPolicy || isSavingPolicy}
              aria-label="Permitir chamados no conjunto inteiro"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            A regra é global e vale para todos os terminais conectados ao mesmo banco.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Catálogos de ativos
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Estes tipos são globais e podem ser
            reutilizados em diferentes máquinas.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={
                catalogKind === "set"
                  ? "default"
                  : "outline"
              }
              onClick={() =>
                setCatalogKind("set")
              }
            >
              Tipos de conjunto
            </Button>

            <Button
              type="button"
              variant={
                catalogKind === "subset"
                  ? "default"
                  : "outline"
              }
              onClick={() =>
                setCatalogKind("subset")
              }
            >
              Tipos de subconjunto
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={loadCatalogs}
              disabled={
                isLoading || isSaving
              }
            >
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Novo cadastro — {catalogTitle}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {catalogDescription}
          </p>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_120px]">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={newForm.name}
                onChange={(event) =>
                  updateNewForm({
                    name: event.target.value,
                  })
                }
                placeholder={
                  catalogKind === "set"
                    ? "Maker"
                    : "Servo de tração"
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Código</Label>
              <Input
                value={newForm.code}
                onChange={(event) =>
                  updateNewForm({
                    code: event.target.value,
                  })
                }
                placeholder="Gerado pelo nome quando vazio"
              />
            </div>

            <div className="space-y-1">
              <Label>Ordem</Label>
              <Input
                value={
                  newForm.displayOrder
                }
                onChange={(event) =>
                  updateNewForm({
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
              value={newForm.description}
              onChange={(event) =>
                updateNewForm({
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
                checked={newForm.isActive}
                onCheckedChange={(checked) =>
                  updateNewForm({
                    isActive: checked,
                  })
                }
              />

              <span className="text-sm font-bold">
                Criar como ativo
              </span>
            </div>

            <Button
              type="button"
              onClick={handleCreate}
              disabled={
                isSaving || isLoading
              }
            >
              Adicionar tipo
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {isLoading ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Carregando catálogo...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhum tipo cadastrado.
          </div>
        ) : (
          items.map((item) => {
            const isEditing =
              editingId === item.id;

            const isCodeLocked =
              lockedCodeIds.has(item.id);

            return (
              <Card
                key={item.id}
                className={
                  item.isActive
                    ? undefined
                    : "opacity-65"
                }
              >
                <CardContent className="p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-[1fr_1fr_120px]">
                        <div className="space-y-1">
                          <Label>Nome</Label>
                          <Input
                            value={
                              editForm.name
                            }
                            onChange={(
                              event,
                            ) =>
                              updateEditForm({
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
                              editForm.code
                            }
                            disabled={
                              isCodeLocked
                            }
                            onChange={(
                              event,
                            ) =>
                              updateEditForm({
                                code: event
                                  .target
                                  .value,
                              })
                            }
                          />

                          {isCodeLocked && (
                            <p className="text-xs font-semibold text-warning">
                              Código bloqueado
                              porque este tipo já
                              está em uso.
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <Label>Ordem</Label>
                          <Input
                            value={
                              editForm.displayOrder
                            }
                            inputMode="numeric"
                            onChange={(
                              event,
                            ) =>
                              updateEditForm({
                                displayOrder:
                                  event.target
                                    .value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label>Descrição</Label>
                        <Input
                          value={
                            editForm.description
                          }
                          onChange={(event) =>
                            updateEditForm({
                              description:
                                event.target
                                  .value,
                            })
                          }
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={
                              editForm.isActive
                            }
                            onCheckedChange={(
                              checked,
                            ) =>
                              updateEditForm({
                                isActive:
                                  checked,
                              })
                            }
                          />

                          <span className="text-sm font-bold">
                            {editForm.isActive
                              ? "Ativo"
                              : "Inativo"}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              handleSave(item)
                            }
                            disabled={isSaving}
                          >
                            Salvar
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={
                              cancelEdit
                            }
                            disabled={isSaving}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-foreground">
                            {item.name}
                          </span>

                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                            {item.isActive
                              ? "Ativo"
                              : "Inativo"}
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          Código:{" "}
                          <span className="font-mono font-bold text-foreground">
                            {item.code}
                          </span>
                          {" • "}
                          Ordem:{" "}
                          {item.displayOrder}
                        </div>

                        {item.description && (
                          <div className="mt-1 text-sm text-muted-foreground">
                            {item.description}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            startEdit(item)
                          }
                          disabled={isSaving}
                        >
                          Editar
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            handleToggleActive(
                              item,
                            )
                          }
                          disabled={isSaving}
                        >
                          {item.isActive
                            ? "Inativar"
                            : "Reativar"}
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            handleDelete(item)
                          }
                          disabled={isSaving}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
