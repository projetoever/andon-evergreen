import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";

import { BigButton } from "@/components/common/BigButton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  getShiftConfigs,
  saveShiftConfigs,
} from "@/services/shiftConfigService";
import {
  getTechnicianShiftFilterConfig,
  saveTechnicianShiftFilterConfig,
} from "@/services/technicianShiftFilterService";
import type { ShiftConfig } from "@/types/settings";

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
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function ShiftsSettingsTab() {
  const [items, setItems] = useState<ShiftConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShiftConfig | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<"all" | "active" | "inactive">("all");
  const [filterByCurrentShift, setFilterByCurrentShift] = useState(true);

  useEffect(() => {
    const list = getShiftConfigs();
    setItems(list);

    const first = list.find((shift) => shift.id === "morning") ?? list[0] ?? null;
    setSelectedId(first?.id ?? null);
    setDraft(first ? { ...first } : null);

    setFilterByCurrentShift(
      getTechnicianShiftFilterConfig().filterByCurrentShift,
    );
  }, []);

  const filteredItems = useMemo(() => {
    const query = normalizeSearch(searchQuery);

    return items.filter((item) => {
      if (statusFilter === "active" && !item.active) return false;
      if (statusFilter === "inactive" && item.active) return false;

      if (!query) return true;
      return normalizeSearch(`${item.name} ${item.id}`).includes(query);
    });
  }, [items, searchQuery, statusFilter]);

  const original = selectedId
    ? items.find((item) => item.id === selectedId) ?? null
    : null;

  const hasUnsavedChanges = Boolean(
    draft &&
      original &&
      (draft.name !== original.name ||
        draft.startTime !== original.startTime ||
        draft.endTime !== original.endTime ||
        draft.active !== original.active ||
        draft.crossesMidnight !== original.crossesMidnight),
  );

  function handleSelect(item: ShiftConfig) {
    if (
      hasUnsavedChanges &&
      !window.confirm("Existem alterações não salvas. Deseja descartá-las?")
    ) {
      return;
    }

    setSelectedId(item.id);
    setDraft({ ...item });
  }

  function handleSave() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Informe o nome do turno.");
      return;
    }
    if (!draft.startTime || !draft.endTime) {
      toast.error("Informe horário inicial e final.");
      return;
    }

    const normalized: ShiftConfig = {
      ...draft,
      name: draft.name.trim(),
      crossesMidnight: draft.startTime > draft.endTime,
    };

    const next = items.map((item) =>
      item.id === normalized.id ? normalized : item,
    );

    setItems(next);
    saveShiftConfigs(next);
    setDraft(normalized);
    toast.success("Turno salvo.");
  }

  function handleCancel() {
    if (original) setDraft({ ...original });
  }

  function handleSaveFilter(enabled: boolean) {
    setFilterByCurrentShift(enabled);
    saveTechnicianShiftFilterConfig({
      filterByCurrentShift: enabled,
      updatedAt: new Date().toISOString(),
    });
    toast.success(
      enabled
        ? "Filtro por turno atual habilitado."
        : "Filtro por turno atual desabilitado.",
    );
  }

  if (!draft && items.length > 0) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-bold">Turnos</h3>
        <p className="text-sm text-muted-foreground">
          Ajuste horários, status e regras de exibição por jornada.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(300px,380px)_1fr]">
        <Section
          title="Turnos configurados"
          description="Edite os turnos existentes. A inclusão de novos turnos não está disponível nesta versão."
        >
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
              aria-label="Pesquisar turnos por nome ou ID"
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm outline-none transition focus:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Limpar pesquisa de turnos"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div
            className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/20 p-1"
            aria-label="Filtrar turnos por status"
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

          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
            <span>{filteredItems.length} de {items.length} turno(s)</span>
            {(searchQuery || statusFilter !== "all") && (
              <button
                type="button"
                className="font-bold text-primary hover:underline"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>

          <div className="min-h-[12rem] max-h-[calc(96dvh-22rem)] space-y-2 overflow-y-auto overscroll-contain pr-2 pb-2">
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
                <p className="text-sm font-bold">Nenhum turno configurado</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
                <p className="text-sm font-bold">Nenhum turno encontrado</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ajuste a pesquisa ou o filtro de status.
                </p>
              </div>
            ) : (
              filteredItems.map((item) => {
                const selected = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border hover:bg-accent/50",
                      !item.active && "opacity-65",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">{item.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {item.id}
                        </p>
                      </div>
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
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {item.startTime} às {item.endTime}
                      {item.crossesMidnight ? " · cruza meia-noite" : ""}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </Section>

        <div className="space-y-4">
          <Section
            title={draft ? "Editar turno" : "Turno"}
            description="As alterações deste cadastro são aplicadas ao salvar."
          >
            {draft ? (
              <>
                <label className="text-sm font-semibold">
                  Nome do turno
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                    className="mt-1 h-10 w-full rounded-md border bg-background px-2"
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm font-semibold">
                    Horário início
                    <input
                      type="time"
                      value={draft.startTime}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          startTime: event.target.value,
                          crossesMidnight: event.target.value > draft.endTime,
                        })
                      }
                      className="mt-1 h-10 w-full rounded-md border bg-background px-2"
                    />
                  </label>

                  <label className="text-sm font-semibold">
                    Horário fim
                    <input
                      type="time"
                      value={draft.endTime}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          endTime: event.target.value,
                          crossesMidnight: draft.startTime > event.target.value,
                        })
                      }
                      className="mt-1 h-10 w-full rounded-md border bg-background px-2"
                    />
                  </label>
                </div>

                <label className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
                  <span>
                    <span className="block text-sm font-bold">Turno ativo</span>
                    <span className="block text-xs text-muted-foreground">
                      Turnos inativos permanecem cadastrados, mas deixam de ser considerados na operação.
                    </span>
                  </span>
                  <Switch
                    checked={draft.active}
                    onCheckedChange={(checked) =>
                      setDraft({ ...draft, active: checked })
                    }
                  />
                </label>

                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                  Cruza meia-noite:{" "}
                  <span className="font-black">
                    {draft.crossesMidnight ? "Sim" : "Não"}
                  </span>
                </div>

                <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
                  <p className="text-xs font-bold text-warning">
                    {hasUnsavedChanges ? "Alterações não salvas" : "Cadastro sincronizado"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <BigButton
                      tone="primary"
                      size="md"
                      onClick={handleSave}
                      disabled={!hasUnsavedChanges}
                    >
                      Salvar turno
                    </BigButton>
                    <BigButton
                      tone="neutral"
                      size="md"
                      onClick={handleCancel}
                      disabled={!hasUnsavedChanges}
                    >
                      Cancelar
                    </BigButton>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecione um turno para editar.
              </p>
            )}
          </Section>

          <Section
            title="Exibição de mantenedores"
            description="Controla a preferência de exibição de mantenedores durante a operação."
          >
            <label className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
              <span>
                <span className="block text-sm font-bold">
                  Priorizar turno atual
                </span>
                <span className="block text-xs text-muted-foreground">
                  Quando ativo, a seleção apresenta primeiro os mantenedores do turno atual.
                </span>
              </span>
              <Switch
                checked={filterByCurrentShift}
                onCheckedChange={handleSaveFilter}
                aria-label="Priorizar mantenedores do turno atual"
              />
            </label>

            <p className="text-xs text-muted-foreground">
              Estado atual:{" "}
              <span className="font-bold text-foreground">
                {filterByCurrentShift ? "Ativo" : "Inativo"}
              </span>
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
