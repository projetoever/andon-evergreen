import { ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "@/i18n/toast";

import { AndonApiError } from "@/api/andonApiClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function catalogToForm(item: MachineAssetCatalogItem): CatalogFormState {
  return {
    code: item.code,
    name: item.name,
    description: item.description ?? "",
    displayOrder: String(item.displayOrder),
    isActive: item.isActive,
  };
}

function buildCatalogPayload(form: CatalogFormState): MachineCatalogDraft {
  const name = form.name.trim();

  if (!name) {
    throw new Error("Informe o nome do tipo de ativo.");
  }

  const displayOrderText = form.displayOrder.trim();

  const displayOrder = displayOrderText ? Number(displayOrderText) : 0;

  if (!Number.isInteger(displayOrder) || displayOrder < 0) {
    throw new Error("A ordem deve ser um número inteiro maior ou igual a zero.");
  }

  return {
    code: form.code.trim() || undefined,
    name,
    description: form.description.trim() || null,
    displayOrder,
    isActive: form.isActive,
  };
}

function sortCatalogItems<T extends MachineAssetCatalogItem>(items: T[]) {
  return [...items].sort((a, b) => {
    if (a.isActive !== b.isActive) {
      return a.isActive ? -1 : 1;
    }

    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }

    return a.name.localeCompare(b.name, "pt-BR", {
      numeric: true,
    });
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : ui("Erro ao processar o catálogo.");
}

export function MachineAssetCatalogPanel() {
  useInterfaceLanguage();
  const [catalogKind, setCatalogKind] = useState<CatalogKind>("set");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [setTypes, setSetTypes] = useState<MachineSetType[]>([]);

  const [subsetTypes, setSubsetTypes] = useState<MachineSubsetType[]>([]);

  const [isLoading, setIsLoading] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);

  const [isLoadingPolicy, setIsLoadingPolicy] = useState(false);

  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  const [newForm, setNewForm] = useState<CatalogFormState>(createEmptyForm);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<CatalogFormState>(createEmptyForm);

  const [lockedCodeIds, setLockedCodeIds] = useState<Set<string>>(() => new Set());

  const items = useMemo(
    () => (catalogKind === "set" ? sortCatalogItems(setTypes) : sortCatalogItems(subsetTypes)),
    [catalogKind, setTypes, subsetTypes],
  );

  const filteredItems = useMemo(() => {
    const query = searchQuery
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return items.filter((item) => {
      if (statusFilter === "active" && !item.isActive) return false;
      if (statusFilter === "inactive" && item.isActive) return false;
      if (!query) return true;

      const haystack = `${item.name} ${item.code} ${item.description ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      return haystack.includes(query);
    });
  }, [items, searchQuery, statusFilter]);

  const catalogTitle = catalogKind === "set" ? ui("Tipos de conjunto") : ui("Tipos de subconjunto");

  const catalogDescription =
    catalogKind === "set"
      ? ui("Cadastre tipos reutilizáveis como Maker, Bagger, Filtro, Esteira e Dosador.")
      : ui(
          "Cadastre tipos reutilizáveis para componentes internos, módulos e pontos específicos do conjunto.",
        );

  async function loadCatalogs() {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [loadedSetTypes, loadedSubsetTypes] = await Promise.all([
        listMachineSetTypes(true),
        listMachineSubsetTypes(true),
      ]);

      setSetTypes(loadedSetTypes);
      setSubsetTypes(loadedSubsetTypes);
    } catch (error) {
      const message = ui("Não foi possível carregar os catálogos: {0}", {
        0: getErrorMessage(error),
      });
      setLoadError(message);
      toast.error(message);
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
    setSearchQuery("");
    setStatusFilter("all");
  }, [catalogKind]);

  function updateNewForm(patch: Partial<CatalogFormState>) {
    setNewForm((current) => ({
      ...current,
      ...patch,
    }));
  }

  function updateEditForm(patch: Partial<CatalogFormState>) {
    setEditForm((current) => ({
      ...current,
      ...patch,
    }));
  }

  async function createCurrentCatalog(draft: MachineCatalogDraft) {
    if (catalogKind === "set") {
      return createMachineSetType(draft);
    }

    return createMachineSubsetType(draft);
  }

  async function updateCurrentCatalog(id: string, patch: MachineCatalogPatch) {
    if (catalogKind === "set") {
      return updateMachineSetType(id, patch);
    }

    return updateMachineSubsetType(id, patch);
  }

  async function deleteCurrentCatalog(id: string) {
    if (catalogKind === "set") {
      return deleteMachineSetType(id);
    }

    return deleteMachineSubsetType(id);
  }

  async function handleCreate() {
    try {
      const payload = buildCatalogPayload(newForm);

      setIsSaving(true);

      await createCurrentCatalog(payload);

      setNewForm(createEmptyForm());
      await loadCatalogs();

      toast.success(`${catalogTitle.slice(0, -1)} criado com sucesso.`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(item: MachineAssetCatalogItem) {
    setEditingId(item.id);
    setEditForm(catalogToForm(item));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(createEmptyForm());
  }

  async function handleSave(item: MachineAssetCatalogItem) {
    try {
      const payload = buildCatalogPayload(editForm);

      setIsSaving(true);

      await updateCurrentCatalog(item.id, payload);

      cancelEdit();
      await loadCatalogs();

      toast.success("Tipo de ativo atualizado.");
    } catch (error) {
      if (error instanceof AndonApiError && error.status === 409) {
        setLockedCodeIds((current) => {
          const next = new Set(current);
          next.add(item.id);
          return next;
        });
      }

      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(item: MachineAssetCatalogItem) {
    try {
      setIsSaving(true);

      await updateCurrentCatalog(item.id, {
        isActive: !item.isActive,
      });

      await loadCatalogs();

      toast.success(item.isActive ? "Tipo de ativo inativado." : "Tipo de ativo reativado.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(item: MachineAssetCatalogItem) {
    const confirmed = window.confirm(
      ui(
        'Excluir o tipo "{0}"? Vínculos apenas com ativos inativos serão preservados sem este tipo. Se houver ativo em uso, o tipo será inativado.',
        { 0: item.name },
      ),
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsSaving(true);

      const result = await deleteCurrentCatalog(item.id);

      await loadCatalogs();

      toast.success(
        result.deleted
          ? "Tipo de ativo excluído."
          : "Tipo ligado a um ativo em uso; o registro foi inativado.",
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
          <CardTitle>{ui("Política de abertura de chamados")}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <Label htmlFor="allow-whole-set-calls" className="text-base font-black">
                {ui("Permitir chamados no conjunto inteiro")}
              </Label>
              <p className="mt-1 text-sm text-muted-foreground">
                {ui(
                  "Quando desativada, o operador deve escolher um equipamento ou subconjunto ativo. Se o conjunto não possuir nenhum, o chamado continua permitido para o conjunto inteiro.",
                )}
              </p>
            </div>

            <Switch
              id="allow-whole-set-calls"
              checked={systemSettings?.allowWholeSetCalls ?? true}
              onCheckedChange={handleWholeSetPolicyChange}
              disabled={!systemSettings || isLoadingPolicy || isSavingPolicy}
              aria-label={ui("Permitir chamados no conjunto inteiro")}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {ui("A regra é global e vale para todos os terminais conectados ao mesmo banco.")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ui("Catálogos de ativos")}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {ui("Estes tipos são globais e podem ser reutilizados em diferentes máquinas.")}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={catalogKind === "set" ? "default" : "outline"}
              onClick={() => setCatalogKind("set")}
            >
              {ui("Tipos de conjunto")}
            </Button>

            <Button
              type="button"
              variant={catalogKind === "subset" ? "default" : "outline"}
              onClick={() => setCatalogKind("subset")}
            >
              {ui("Tipos de subconjunto")}
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadCatalogs()}
              disabled={isLoading || isSaving}
            >
              {ui("Atualizar")}
            </Button>
          </div>

          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={ui("Pesquisar nome, código ou descrição...")}
                aria-label={ui("Pesquisar tipos de ativos")}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label={ui("Limpar pesquisa de tipos de ativos")}
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div
              className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/20 p-1"
              aria-label={ui("Filtrar tipos de ativos por status")}
            >
              {(
                [
                  ["all", ui("Todos")],
                  ["active", ui("Ativos", {}, "record")],
                  ["inactive", ui("Inativos", {}, "record")],
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

          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
            <span>
              {filteredItems.length}
              {ui(" de ")}
              {items.length}
              {ui(" tipo(s)")}
            </span>
            {(searchQuery || statusFilter !== "all") && (
              <button
                type="button"
                className="font-bold text-primary hover:underline"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
              >
                {ui("Limpar filtros")}
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {ui("Novo cadastro — ")}
            {catalogTitle}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{catalogDescription}</p>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_120px]">
            <div className="space-y-1">
              <Label>{ui("Nome")}</Label>
              <Input
                value={newForm.name}
                onChange={(event) =>
                  updateNewForm({
                    name: event.target.value,
                  })
                }
                placeholder={catalogKind === "set" ? ui("Maker") : ui("Servo de tração")}
              />
            </div>

            <div className="space-y-1">
              <Label>{ui("Código")}</Label>
              <Input
                value={newForm.code}
                onChange={(event) =>
                  updateNewForm({
                    code: event.target.value,
                  })
                }
                placeholder={ui("Gerado pelo nome quando vazio")}
              />
            </div>

            <div className="space-y-1">
              <Label>{ui("Ordem")}</Label>
              <Input
                value={newForm.displayOrder}
                onChange={(event) =>
                  updateNewForm({
                    displayOrder: event.target.value,
                  })
                }
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>{ui("Descrição")}</Label>
            <Input
              value={newForm.description}
              onChange={(event) =>
                updateNewForm({
                  description: event.target.value,
                })
              }
              placeholder={ui("Descrição opcional")}
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

              <span className="text-sm font-bold">{ui("Criar como ativo")}</span>
            </div>

            <Button type="button" onClick={handleCreate} disabled={isSaving || isLoading}>
              {ui("Adicionar tipo")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="min-h-[12rem] max-h-[calc(96dvh-22rem)] space-y-2 overflow-y-auto overscroll-contain pr-2 pb-2">
        {isLoading ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            {ui("Carregando catálogo...")}
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 text-sm text-danger"
          >
            <span>{systemMessage(loadError)}</span>
            <button
              type="button"
              className="font-bold underline"
              onClick={() => void loadCatalogs()}
            >
              {ui("Tentar novamente")}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            {ui("Nenhum tipo cadastrado.")}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center">
            <p className="text-sm font-bold">{ui("Nenhum tipo encontrado")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {ui("Ajuste a pesquisa ou o filtro de status.")}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isEditing = editingId === item.id;

            const isCodeLocked = lockedCodeIds.has(item.id);

            return (
              <Card
                key={item.id}
                className={[
                  isEditing ? "border-primary ring-1 ring-primary/30" : "",
                  item.isActive ? "" : "opacity-65",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <CardContent className="p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-[1fr_1fr_120px]">
                        <div className="space-y-1">
                          <Label>{ui("Nome")}</Label>
                          <Input
                            value={editForm.name}
                            onChange={(event) =>
                              updateEditForm({
                                name: event.target.value,
                              })
                            }
                          />
                        </div>

                        <div className="space-y-1">
                          <Label>{ui("Código")}</Label>
                          <Input
                            value={editForm.code}
                            disabled={isCodeLocked}
                            onChange={(event) =>
                              updateEditForm({
                                code: event.target.value,
                              })
                            }
                          />

                          {isCodeLocked && (
                            <p className="text-xs font-semibold text-warning">
                              {ui("Código bloqueado porque este tipo já está em uso.")}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <Label>{ui("Ordem")}</Label>
                          <Input
                            value={editForm.displayOrder}
                            inputMode="numeric"
                            onChange={(event) =>
                              updateEditForm({
                                displayOrder: event.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label>{ui("Descrição")}</Label>
                        <Input
                          value={editForm.description}
                          onChange={(event) =>
                            updateEditForm({
                              description: event.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={editForm.isActive}
                            onCheckedChange={(checked) =>
                              updateEditForm({
                                isActive: checked,
                              })
                            }
                          />

                          <span className="text-sm font-bold">
                            {editForm.isActive
                              ? ui("Ativo", {}, "record")
                              : ui("Inativo", {}, "record")}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSave(item)}
                            disabled={isSaving}
                          >
                            {ui("Salvar")}
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                            disabled={isSaving}
                          >
                            {ui("Cancelar")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-foreground">{item.name}</span>

                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                            {item.isActive
                              ? ui("Ativo", {}, "record")
                              : ui("Inativo", {}, "record")}
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          {ui("Código:")}{" "}
                          <span className="font-mono font-bold text-foreground">{item.code}</span>
                          {" • "}
                          {ui("Ordem:")} {item.displayOrder}
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
                          onClick={() => startEdit(item)}
                          disabled={isSaving}
                        >
                          {ui("Editar")}
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => handleToggleActive(item)}
                          disabled={isSaving}
                        >
                          {item.isActive ? ui("Inativar") : ui("Reativar")}
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(item)}
                          disabled={isSaving}
                        >
                          {ui("Excluir")}
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
