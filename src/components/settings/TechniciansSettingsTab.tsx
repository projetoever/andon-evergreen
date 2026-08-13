import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BigButton } from "@/components/common/BigButton";
import { useTechnicians } from "@/hooks/useTechnicians";
import { cn } from "@/lib/utils";
import { getShiftConfigs } from "@/services/shiftConfigService";
import { DEFAULT_CATEGORIES, getCategoryConfigs } from "@/services/categoryConfigService";
import type { CallSubtype } from "@/types/andon";
import type { AndonCategoryConfig, ShiftConfig, TechnicianConfig } from "@/types/settings";

const DEFAULT_AREA_OPTIONS = DEFAULT_CATEGORIES.map((category) => ({
  id: category.id,
  label: category.displayName,
}));

const EMPTY_DRAFT: TechnicianConfig = {
  id: "",
  name: "",
  area: "electrical",
  shiftId: "",
  shiftIds: [],
  active: true,
  hasPin: false,
  hasTag: false,
  pin: "",
  tag: "",
};

function CardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h4 className="text-sm font-bold uppercase tracking-wide text-foreground">{title}</h4>
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

  function handleAddTechnician() {
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
  }

  function handleSelect(item: TechnicianConfig) {
    setSelectedId(item.id);
    setDraft({ ...item, pin: "", tag: "" });
  }

  async function handleSave() {
    const trimmedName = draft.name.trim();
    if (!trimmedName) return toast.error("Informe o nome do manutentor.");
    if (!draft.shiftId) return toast.error("Selecione o turno do manutentor.");
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
    if (duplicate) return toast.error("Já existe manutentor com este nome.");

    setIsSaving(true);

    try {
      const input = {
        name: trimmedName,
        area: draft.area,
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
      toast.success("Manutentor salvo no banco de dados.");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "Não foi possível salvar o manutentor.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!draft.id) return;

    setIsSaving(true);

    try {
      const saved = await updateTechnician(draft.id, { active: !draft.active });
      setDraft(saved);
      toast.success(saved.active ? "Manutentor reativado." : "Manutentor inativado.");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "Não foi possível atualizar o manutentor.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-bold">Manutentores</h3>
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
        <CardSection title="Manutentores cadastrados">
          <BigButton tone="neutral" size="md" onClick={handleAddTechnician}>
            Adicionar manutentor
          </BigButton>
          <div className="space-y-2">
            {isLoading && (
              <p className="text-sm text-muted-foreground">Carregando mantenedores...</p>
            )}
            {!isLoading && !error && technicians.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>
            )}
            {technicians.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left",
                  selectedId === item.id ? "border-primary bg-primary/10" : "border-border",
                )}
              >
                <p className="text-sm font-bold">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {categories.find((area) => area.id === item.area)?.displayName ?? item.area} ·{" "}
                  {item.shiftId ? shiftNameById[item.shiftId] : "Sem turno"}
                </p>
                <p className="text-xs text-muted-foreground">{item.active ? "Ativo" : "Inativo"}</p>
                <p className="text-xs text-muted-foreground">
                  PIN: {item.hasPin ? "configurado" : "pendente"} · Tag:{" "}
                  {item.hasTag ? "configurada" : "não cadastrada"}
                </p>
              </button>
            ))}
          </div>
        </CardSection>

        <CardSection title={selectedId ? "Editar manutentor" : "Novo manutentor"}>
          <label className="text-sm font-semibold">
            Nome do manutentor
            <input
              className="mt-1 h-10 w-full rounded-md border bg-background px-2"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
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
          </label>
          <label className="text-sm font-semibold">
            Código da tag RF (opcional)
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
          </label>
          <p className="text-xs text-muted-foreground">
            PIN e tag são protegidos no banco e nunca são exibidos novamente.
          </p>
          <label className="text-sm font-semibold">
            Área técnica
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-2"
              value={draft.area}
              onChange={(event) => setDraft({ ...draft, area: event.target.value as CallSubtype })}
            >
              {areaOptions.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Turno do manutentor
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
          <label className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
            />
            Ativo
          </label>
          <div className="flex flex-wrap gap-2 pt-2">
            <BigButton
              tone="primary"
              size="md"
              onClick={() => void handleSave()}
              disabled={isSaving || Boolean(error)}
            >
              {isSaving ? "Salvando..." : "Salvar manutentor"}
            </BigButton>
            <BigButton tone="neutral" size="md" onClick={handleAddTechnician}>
              Cancelar
            </BigButton>
            <BigButton
              tone="danger"
              size="md"
              onClick={() => void handleToggleActive()}
              disabled={!draft.id || isSaving || Boolean(error)}
            >
              {draft.active ? "Inativar" : "Reativar"}
            </BigButton>
          </div>
        </CardSection>
      </div>
    </div>
  );
}
