import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { BigButton } from "@/components/common/BigButton";
import { useTechnicians } from "@/hooks/useTechnicians";
import { cn } from "@/lib/utils";
import { getShiftConfigs } from "@/services/shiftConfigService";
import { DEFAULT_CATEGORIES, getCategoryConfigs } from "@/services/categoryConfigService";
import type { CallSubtype } from "@/types/andon";
import type { AndonCategoryConfig, ShiftConfig, TechnicianConfig } from "@/types/settings";
import { filterTechniciansForAdmin } from "@/utils/adminEntityFilterUtils";

const DEFAULT_AREA_OPTIONS = DEFAULT_CATEGORIES.map((category) => ({
  id: category.id,
  label: category.displayName,
}));

const EMPTY_DRAFT: TechnicianConfig = {
  id: "",
  employeeId: "",
  name: "",
  area: "electrical",
  areas: ["electrical"],
  shiftId: "",
  shiftIds: [],
  active: true,
  hasPin: false,
  hasTag: false,
  pin: "",
  tag: "",
};

function CardSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3 rounded-xl border border-border bg-card p-4", className)}>
      <h4 className="shrink-0 text-sm font-bold uppercase tracking-wide text-foreground">{title}</h4>
      {children}
    </section>
  );
}

function DetailSection({
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

export function TechniciansSettingsTab() {
  const { technicians, isLoading, error, createTechnician, updateTechnician, refreshTechnicians } =
    useTechnicians();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TechnicianConfig>(EMPTY_DRAFT);
  const [shifts, setShifts] = useState<ShiftConfig[]>([]);
  const [categories, setCategories] = useState<AndonCategoryConfig[]>(DEFAULT_CATEGORIES);
  const [isSaving, setIsSaving] = useState(false);
  const [areaToAdd, setAreaToAdd] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState<"all" | CallSubtype>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [shiftFilter, setShiftFilter] = useState("all");

  useEffect(() => {
    setShifts(getShiftConfigs());
    getCategoryConfigs()
      .then(setCategories)
      .catch((loadError) =>
        toast.error(
          loadError instanceof Error ? loadError.message : "Não foi possível carregar os setores.",
        ),
      );
  }, []);

  const areaOptions = useMemo(() => {
    const activeOptions = categories
      .filter((category) => category.active && category.categoryGroup === "maintenance")
      .map((category) => ({ id: category.id, label: category.displayName }));
    return activeOptions.length ? activeOptions : DEFAULT_AREA_OPTIONS;
  }, [categories]);

  const shiftNameById = useMemo(
    () => Object.fromEntries(shifts.map((shift) => [shift.id, shift.name])),
    [shifts],
  );

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const filterAreaOptions = useMemo(() => {
    const areas = new Set<CallSubtype>();
    categories
      .filter((category) => category.categoryGroup === "maintenance")
      .forEach((category) => areas.add(category.id));
    technicians.forEach((technician) =>
      (technician.areas?.length ? technician.areas : [technician.area]).forEach((area) =>
        areas.add(area),
      ),
    );

    return Array.from(areas)
      .map((id) => ({
        id,
        label: categoryById.get(id)?.displayName ?? id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [categories, categoryById, technicians]);

  const filteredTechnicians = useMemo(
    () =>
      filterTechniciansForAdmin(
        technicians,
        searchQuery,
        areaFilter,
        statusFilter,
        shiftFilter,
      ),
    [areaFilter, searchQuery, shiftFilter, statusFilter, technicians],
  );

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    areaFilter !== "all" ||
    statusFilter !== "all" ||
    shiftFilter !== "all";

  const selectedAreas = draft.areas?.length ? draft.areas : [draft.area];
  const availableAreaOptions = areaOptions.filter((area) => !selectedAreas.includes(area.id));
  const persistedTechnician = selectedId
    ? technicians.find((technician) => technician.id === selectedId) ?? null
    : null;

  const hasUnsavedChanges = useMemo(() => {
    if (!persistedTechnician) {
      return Boolean(
        draft.name.trim() ||
          (draft.employeeId ?? "").trim() ||
          draft.shiftId ||
          (draft.pin ?? "").trim() ||
          (draft.tag ?? "").trim(),
      );
    }

    const persistedAreas = persistedTechnician.areas?.length
      ? persistedTechnician.areas
      : [persistedTechnician.area];

    return (
      draft.name !== persistedTechnician.name ||
      (draft.employeeId ?? "") !== (persistedTechnician.employeeId ?? "") ||
      draft.shiftId !== persistedTechnician.shiftId ||
      draft.active !== persistedTechnician.active ||
      [...selectedAreas].sort().join("|") !== [...persistedAreas].sort().join("|") ||
      Boolean((draft.pin ?? "").trim()) ||
      Boolean((draft.tag ?? "").trim())
    );
  }, [draft, persistedTechnician, selectedAreas]);

  function handleCancelEdit() {
    if (persistedTechnician) {
      handleSelect(persistedTechnician);
      return;
    }
    handleAddTechnician();
  }

  function handleAddTechnician() {
    setSelectedId(null);
    const firstArea = areaOptions[0]?.id ?? EMPTY_DRAFT.area;
    setDraft({ ...EMPTY_DRAFT, area: firstArea, areas: [firstArea] });
    setAreaToAdd("");
  }

  function handleSelect(item: TechnicianConfig) {
    setSelectedId(item.id);
    const areas = item.areas?.length ? item.areas : [item.area];
    setDraft({
      ...item,
      area: areas.includes(item.area) ? item.area : areas[0],
      areas,
      employeeId: item.employeeId ?? "",
      pin: "",
      tag: "",
    });
    setAreaToAdd("");
  }

  function handleAddArea() {
    if (!areaToAdd || selectedAreas.includes(areaToAdd as CallSubtype)) return;
    const areas = [...selectedAreas, areaToAdd as CallSubtype];
    setDraft({ ...draft, areas });
    setAreaToAdd("");
  }

  function handleRemoveArea(area: CallSubtype) {
    if (selectedAreas.length <= 1) {
      toast.error("O mantenedor deve possuir pelo menos uma área técnica.");
      return;
    }
    const areas = selectedAreas.filter((currentArea) => currentArea !== area);
    setDraft({ ...draft, area: areas.includes(draft.area) ? draft.area : areas[0], areas });
  }

  async function handleSave() {
    const trimmedName = draft.name.trim();
    const employeeId = draft.employeeId?.trim() ?? "";
    if (!trimmedName) return toast.error("Informe o nome do mantenedor.");
    if (!employeeId) return toast.error("Informe o ID do colaborador.");
    if (!selectedAreas.length) return toast.error("Selecione pelo menos uma área técnica.");
    if (new Set(selectedAreas).size !== selectedAreas.length) {
      return toast.error("Não repita áreas técnicas no cadastro.");
    }
    if (!draft.shiftId) return toast.error("Selecione o turno do mantenedor.");
    const pin = draft.pin?.trim() ?? "";
    if ((!draft.id || !draft.hasPin) && !/^\d{4,8}$/.test(pin)) {
      return toast.error("Informe um PIN obrigatório de 4 a 8 números.");
    }
    if (pin && !/^\d{4,8}$/.test(pin)) {
      return toast.error("O PIN deve conter de 4 a 8 números.");
    }

    const duplicate = technicians.some(
      (technician) =>
        technician.id !== draft.id &&
        technician.name.localeCompare(trimmedName, "pt-BR", { sensitivity: "base" }) === 0,
    );
    if (duplicate) return toast.error("Já existe mantenedor com este nome.");

    setIsSaving(true);

    try {
      const input = {
        employeeId,
        name: trimmedName,
        area: selectedAreas.includes(draft.area) ? draft.area : selectedAreas[0],
        areas: selectedAreas,
        shiftId: draft.shiftId,
        active: draft.active,
        ...(pin ? { pin } : {}),
        ...(draft.tag?.trim() ? { tag: draft.tag.trim() } : {}),
      };
      const saved = draft.id
        ? await updateTechnician(draft.id, input)
        : await createTechnician(input);

      setSelectedId(saved.id);
      setDraft({ ...saved, pin: "", tag: "" });
      toast.success("Mantenedor salvo no banco de dados.");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "Não foi possível salvar o mantenedor.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!draft.id) return;

    const employeeId = draft.employeeId?.trim() ?? "";
    if (!employeeId) {
      return toast.error("Informe o ID do colaborador antes de alterar o cadastro.");
    }

    setIsSaving(true);

    try {
      const saved = await updateTechnician(draft.id, {
        active: !draft.active,
        employeeId,
      });
      setDraft(saved);
      toast.success(saved.active ? "Mantenedor reativado." : "Mantenedor inativado.");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "Não foi possível atualizar o mantenedor.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-bold">Mantenedores</h3>
        <p className="text-sm text-muted-foreground">
          Cadastre, edite e inative mantenedores por área e turno. Os registros são armazenados no
          banco de dados do ANDON.
        </p>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <span>{error}</span>
          <button
            type="button"
            className="font-bold underline"
            onClick={() => void refreshTechnicians()}
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]">
        <CardSection
          title="Mantenedores cadastrados"
          className="md:flex md:h-[calc(96dvh-13rem)] md:min-h-0 md:flex-col"
        >
          <div className="shrink-0 space-y-2">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Pesquisar por nome ou ID..."
                aria-label="Pesquisar mantenedores por nome ou ID"
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Limpar pesquisa de mantenedores"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div
              className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/20 p-1"
              aria-label="Filtrar mantenedores por status"
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

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                Área técnica
                <select
                  aria-label="Filtrar mantenedores por setor"
                  value={areaFilter}
                  onChange={(event) =>
                    setAreaFilter(
                      event.target.value === "all"
                        ? "all"
                        : (event.target.value as CallSubtype),
                    )
                  }
                  className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm font-semibold text-foreground"
                >
                  <option value="all">Todos os setores</option>
                  {filterAreaOptions.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                Turno
                <select
                  aria-label="Filtrar mantenedores por turno"
                  value={shiftFilter}
                  onChange={(event) => setShiftFilter(event.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm font-semibold text-foreground"
                >
                  <option value="all">Todos os turnos</option>
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.name}
                    </option>
                  ))}
                  <option value="__none__">Sem turno</option>
                </select>
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {filteredTechnicians.length} de {technicians.length} mantenedor(es)
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setAreaFilter("all");
                    setStatusFilter("all");
                    setShiftFilter("all");
                  }}
                  className="font-bold text-primary hover:underline"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          <BigButton
            tone="neutral"
            size="md"
            onClick={handleAddTechnician}
            disabled={isLoading || Boolean(error)}
          >
            Adicionar mantenedor
          </BigButton>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-2 pb-2">
            {isLoading && (
              <p className="text-sm text-muted-foreground">Carregando mantenedores...</p>
            )}
            {!isLoading && !error && technicians.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>
            )}
            {!isLoading && !error && technicians.length > 0 && filteredTechnicians.length === 0 && (
              <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center">
                <p className="text-sm font-bold text-foreground">Nenhum mantenedor encontrado</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ajuste a pesquisa ou os filtros de status, setor e turno.
                </p>
              </div>
            )}
            {filteredTechnicians.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/60",
                  selectedId === item.id
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border",
                  !item.active && "opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-bold">{item.name}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      item.active
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {item.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  ID: {item.employeeId?.trim() || "pendente"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(item.areas?.length ? item.areas : [item.area])
                    .map((area) => categoryById.get(area)?.displayName ?? area)
                    .join(", ")}{" "}
                  · {item.shiftId ? shiftNameById[item.shiftId] : "Sem turno"}
                </p>
                <p className="text-xs text-muted-foreground">
                  PIN: {item.hasPin ? "configurado" : "pendente"} · Tag:{" "}
                  {item.hasTag ? "configurada" : "não cadastrada"}
                </p>
              </button>
            ))}
          </div>
        </CardSection>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3 px-1">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                {selectedId ? "Cadastro de mantenedor" : "Novo cadastro"}
              </p>
              <h3 className="text-xl font-black">
                {selectedId ? draft.name || "Mantenedor" : "Novo mantenedor"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Organize identificação, áreas, turno e credenciais em um único cadastro.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedId && (
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-black uppercase",
                    draft.active
                      ? "bg-success/10 text-success"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {draft.active ? "Ativo" : "Inativo"}
                </span>
              )}
              {hasUnsavedChanges && (
                <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-bold text-warning">
                  Alterações não salvas
                </span>
              )}
            </div>
          </div>

          <DetailSection
            title="Identificação"
            description="Dados básicos usados para localizar e identificar o colaborador."
          >
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="text-sm font-semibold">
                Nome do mantenedor
                <input
                  className="mt-1 h-10 w-full rounded-md border bg-background px-2"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label className="text-sm font-semibold">
                ID do colaborador
                <input
                  autoComplete="off"
                  maxLength={80}
                  className="mt-1 h-10 w-full rounded-md border bg-background px-2 font-mono"
                  value={draft.employeeId ?? ""}
                  onChange={(event) => setDraft({ ...draft, employeeId: event.target.value })}
                  placeholder="Registro do colaborador"
                />
              </label>
            </div>
          </DetailSection>

          <DetailSection
            title="Áreas técnicas"
            description="Defina todos os setores em que este mantenedor pode atuar."
          >
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {selectedAreas.map((area) => {
                const category = categoryById.get(area);
                return (
                  <div
                    key={area}
                    className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {category?.displayName ?? area}
                      {category && !category.active ? " (inativa)" : ""}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-bold text-danger hover:underline"
                      onClick={() => handleRemoveArea(area)}
                    >
                      Remover
                    </button>
                  </div>
                );
              })}
            </div>

            {availableAreaOptions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="Nova área técnica"
                  className="h-10 min-w-48 flex-1 rounded-md border bg-background px-2"
                  value={areaToAdd}
                  onChange={(event) => setAreaToAdd(event.target.value)}
                >
                  <option value="">Selecione uma área</option>
                  {availableAreaOptions.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="h-10 rounded-md border border-primary px-3 text-sm font-bold text-primary disabled:opacity-50"
                  disabled={!areaToAdd}
                  onClick={handleAddArea}
                >
                  + Adicionar área técnica
                </button>
              </div>
            )}
          </DetailSection>

          <DetailSection
            title="Turno e status"
            description="Vincule o colaborador ao turno e controle sua disponibilidade no sistema."
          >
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
              <label className="text-sm font-semibold">
                Turno do mantenedor
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-2"
                  value={draft.shiftId}
                  onChange={(event) => setDraft({ ...draft, shiftId: event.target.value })}
                >
                  <option value="">Selecione um turno</option>
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
                <span>
                  <span className="block text-sm font-bold">Cadastro ativo</span>
                  <span className="block text-xs text-muted-foreground">
                    Disponível para identificação e atendimento.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                  className="h-4 w-4"
                />
              </label>
            </div>
          </DetailSection>

          <DetailSection
            title="Credenciais"
            description="PIN é obrigatório. RFID permanece opcional e pode ser cadastrado depois."
          >
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="text-sm font-semibold">
                PIN obrigatório
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={8}
                  className="mt-1 h-10 w-full rounded-md border bg-background px-2 font-mono"
                  value={draft.pin ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, pin: event.target.value.replace(/\D/g, "") })
                  }
                  placeholder={
                    draft.hasPin ? "Deixe em branco para manter o PIN atual" : "4 a 8 números"
                  }
                />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {draft.hasPin ? "PIN atual configurado." : "PIN ainda não configurado."}
                </span>
              </label>

              <label className="text-sm font-semibold">
                Tag RFID (opcional)
                <input
                  autoComplete="off"
                  maxLength={64}
                  className="mt-1 h-10 w-full rounded-md border bg-background px-2 font-mono uppercase"
                  value={draft.tag ?? ""}
                  onChange={(event) => setDraft({ ...draft, tag: event.target.value })}
                  placeholder={
                    draft.hasTag
                      ? "Deixe em branco para manter a tag atual"
                      : "Aproxime a tag ou digite o código"
                  }
                />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {draft.hasTag ? "Tag atual configurada." : "Nenhuma tag cadastrada."}
                </span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              As credenciais são protegidas no banco e nunca são exibidas novamente.
            </p>
          </DetailSection>

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
            <div className="text-xs text-muted-foreground">
              {isSaving
                ? "Salvando alterações..."
                : hasUnsavedChanges
                  ? "Existem alterações pendentes."
                  : selectedId
                    ? "Cadastro sincronizado."
                    : "Preencha os dados para criar o mantenedor."}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedId && (
                <BigButton
                  tone="danger"
                  size="md"
                  onClick={() => void handleToggleActive()}
                  disabled={isSaving || Boolean(error)}
                >
                  {draft.active ? "Inativar" : "Reativar"}
                </BigButton>
              )}
              <BigButton
                tone="neutral"
                size="md"
                onClick={handleCancelEdit}
                disabled={isSaving}
              >
                Cancelar
              </BigButton>
              <BigButton
                tone="primary"
                size="md"
                onClick={() => void handleSave()}
                disabled={isSaving || Boolean(error) || !hasUnsavedChanges}
              >
                {isSaving ? "Salvando..." : selectedId ? "Salvar alterações" : "Criar mantenedor"}
              </BigButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
