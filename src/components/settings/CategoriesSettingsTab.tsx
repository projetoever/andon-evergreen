import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";

import { BigButton } from "@/components/common/BigButton";
import { cn } from "@/lib/utils";
import {
  createCategoryConfig,
  deleteCategoryConfig,
  getCategoryConfigs,
  updateCategoryConfig,
} from "@/services/categoryConfigService";
import type { AndonCategoryConfig } from "@/types/settings";

function CardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h4 className="text-sm font-bold uppercase tracking-wide text-foreground">{title}</h4>
      {children}
    </section>
  );
}

function emptyCategory(displayOrder: number): AndonCategoryConfig {
  return {
    id: "",
    categoryGroup: "maintenance",
    displayName: "",
    color: "#F5B700",
    active: true,
    displayOrder,
  };
}

function categorySlug(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function CategoriesSettingsTab() {
  const [items, setItems] = useState<AndonCategoryConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AndonCategoryConfig>(() => emptyCategory(10));
  const [isBusy, setIsBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return items.filter((item) => {
      if (statusFilter === "active" && !item.active) return false;
      if (statusFilter === "inactive" && item.active) return false;
      if (!normalizedQuery) return true;

      const haystack = `${item.displayName} ${item.id}`
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      return haystack.includes(normalizedQuery);
    });
  }, [items, searchQuery, statusFilter]);

  const refresh = useCallback(async (preferredId?: string | null) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const list = await getCategoryConfigs();
      setItems(list);
      const selected = list.find((item) => item.id === preferredId) ?? list[0] ?? null;
      setSelectedId(selected?.id ?? null);
      setDraft(selected ? { ...selected } : emptyCategory(10));
      return list;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível carregar os setores";
      setLoadError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh("electrical").catch((error) => {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os setores");
    });
  }, [refresh]);

  function handleSelect(item: AndonCategoryConfig) {
    setSelectedId(item.id);
    setDraft({ ...item });
  }

  function handleAdd() {
    const nextOrder = Math.max(0, ...items.map((item) => item.displayOrder)) + 10;
    setSelectedId(null);
    setDraft(emptyCategory(nextOrder));
  }

  async function handleSave() {
    if (isBusy) return;
    const displayName = draft.displayName.trim();
    const id = selectedId ?? categorySlug(draft.id || displayName);
    if (!displayName) return toast.error("Informe o nome do setor.");
    if (!id || !/^[a-z0-9_]+$/.test(id)) {
      return toast.error("ID inválido. Use letras minúsculas, números e underscore.");
    }
    if (!/^#[0-9a-f]{6}$/i.test(draft.color)) {
      return toast.error("Selecione uma cor válida.");
    }

    setIsBusy(true);
    try {
      if (selectedId) {
        await updateCategoryConfig(selectedId, {
          displayName,
          categoryGroup: draft.categoryGroup,
          color: draft.color.toUpperCase(),
          active: draft.active,
          displayOrder: Number(draft.displayOrder) || 0,
        });
      } else {
        await createCategoryConfig({
          id,
          displayName,
          categoryGroup: draft.categoryGroup,
          color: draft.color.toUpperCase(),
          active: draft.active,
          displayOrder: Number(draft.displayOrder) || 0,
        });
      }
      await refresh(id);
      toast.success(selectedId ? "Setor atualizado." : "Setor adicionado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o setor");
    } finally {
      setIsBusy(false);
    }
  }

  function handleCancel() {
    if (!selectedId) {
      const first = items[0];
      setSelectedId(first?.id ?? null);
      setDraft(first ? { ...first } : emptyCategory(10));
      return;
    }
    const original = items.find((item) => item.id === selectedId);
    if (original) setDraft({ ...original });
  }

  async function handleRemove() {
    if (!selectedId || isBusy) return;
    const confirmed = window.confirm(
      `Remover o setor "${draft.displayName}"? Setores que possuem histórico deverão ser apenas inativados.`,
    );
    if (!confirmed) return;
    setIsBusy(true);
    try {
      await deleteCategoryConfig(selectedId);
      await refresh(null);
      toast.success("Setor removido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o setor");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-bold">Setores / categorias</h3>
        <p className="text-sm text-muted-foreground">
          Adicione, edite, ordene ou remova os setores exibidos como botões na tela da máquina.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]">
        <CardSection title="Setores cadastrados">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {filteredItems.length} de {items.length} setor(es)
            </p>
            <BigButton
              tone="neutral"
              size="md"
              onClick={handleAdd}
              disabled={isBusy || isLoading || Boolean(loadError)}
            >
              Adicionar setor
            </BigButton>
          </div>

          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Pesquisar nome ou ID..."
              aria-label="Pesquisar setores por nome ou ID"
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm outline-none transition focus:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Limpar pesquisa de setores"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div
            className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/20 p-1"
            aria-label="Filtrar setores por status"
          >
            {(
              [
                ["all", "Todos"],
                ["active", "Ativos"],
                ["inactive", "Inativos"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(value)}
                className={cn(
                  "min-h-9 rounded-md px-2 text-xs font-bold transition-colors",
                  statusFilter === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {isLoading && (
              <p className="py-4 text-sm text-muted-foreground">Carregando setores...</p>
            )}

            {!isLoading && loadError && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <p className="font-bold">Não foi possível carregar os setores.</p>
                <p>{loadError}</p>
                <button
                  type="button"
                  className="mt-2 font-bold underline"
                  onClick={() => void refresh(selectedId).catch(() => undefined)}
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {!isLoading && !loadError && items.length === 0 && (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
                <p className="text-sm font-bold">Nenhum setor cadastrado</p>
              </div>
            )}

            {!isLoading &&
              !loadError &&
              items.length > 0 &&
              filteredItems.length === 0 && (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
                  <p className="text-sm font-bold">Nenhum setor encontrado</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ajuste a pesquisa ou o filtro de status.
                  </p>
                </div>
              )}

            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  selectedId === item.id
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border hover:bg-accent/50",
                  !item.active && "opacity-70",
                )}
              >
                <span
                  className="h-8 w-8 shrink-0 rounded-lg border border-white/20 shadow"
                  style={{ backgroundColor: item.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{item.displayName}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {item.id}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.categoryGroup === "maintenance" ? "Manutenção" : "Produção / apoio"}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
                    item.active
                      ? "bg-success/10 text-success"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.active ? "Ativo" : "Inativo"}
                </span>
              </button>
            ))}
          </div>
        </CardSection>

        <CardSection title={selectedId ? "Editar setor" : "Novo setor"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Nome exibido
              <input
                value={draft.displayName}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    displayName: event.target.value,
                    id: selectedId ? current.id : categorySlug(event.target.value),
                  }))
                }
                className="mt-1 h-10 w-full rounded-md border bg-background px-2"
                placeholder="Ex.: Pneumática"
              />
            </label>
            <label className="text-sm font-semibold">
              ID interno
              <input
                readOnly={Boolean(selectedId)}
                value={draft.id}
                onChange={(event) => setDraft({ ...draft, id: categorySlug(event.target.value) })}
                className={cn(
                  "mt-1 h-10 w-full rounded-md border px-2",
                  selectedId ? "bg-muted text-muted-foreground" : "bg-background",
                )}
                placeholder="pneumatic"
              />
            </label>
            <label className="text-sm font-semibold">
              Grupo
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-2"
                value={draft.categoryGroup}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    categoryGroup: event.target.value as AndonCategoryConfig["categoryGroup"],
                  })
                }
              >
                <option value="maintenance">Manutenção</option>
                <option value="production">Produção / apoio</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Ordem de exibição
              <input
                type="number"
                min={0}
                step={10}
                value={draft.displayOrder}
                onChange={(event) =>
                  setDraft({ ...draft, displayOrder: Number(event.target.value) })
                }
                className="mt-1 h-10 w-full rounded-md border bg-background px-2"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <label className="text-sm font-semibold">
              Cor do botão na tela da máquina
              <div className="mt-1 flex h-12 items-center gap-3 rounded-md border border-border bg-background px-2">
                <input
                  type="color"
                  value={draft.color}
                  onChange={(event) =>
                    setDraft({ ...draft, color: event.target.value.toUpperCase() })
                  }
                  className="h-9 w-14 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <span className="font-mono text-sm font-bold">{draft.color.toUpperCase()}</span>
              </div>
            </label>
            <div>
              <span className="text-sm font-semibold">Prévia</span>
              <div
                className="mt-1 flex h-12 items-center justify-center rounded-md border-2 px-2 text-sm font-black uppercase shadow"
                style={{ backgroundColor: draft.color, borderColor: draft.color }}
              >
                {draft.displayName || "Setor"}
              </div>
            </div>
          </div>

          <label className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
            />
            Exibir setor na tela da máquina
          </label>

          <p className="text-xs text-muted-foreground">
            Setores com chamados históricos não são apagados; inative-os para preservar os registros.
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            <BigButton tone="primary" size="md" onClick={() => void handleSave()} disabled={isBusy}>
              {isBusy ? "Salvando..." : "Salvar setor"}
            </BigButton>
            <BigButton tone="neutral" size="md" onClick={handleCancel} disabled={isBusy}>
              Cancelar
            </BigButton>
            <BigButton
              tone="danger"
              size="md"
              onClick={() => void handleRemove()}
              disabled={!selectedId || isBusy}
            >
              Remover setor
            </BigButton>
          </div>
        </CardSection>
      </div>
    </div>
  );
}
