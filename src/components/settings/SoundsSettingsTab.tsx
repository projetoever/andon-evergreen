import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";

import { BigButton } from "@/components/common/BigButton";
import { useAndon } from "@/context/AndonProvider";
import { CALL_TYPE_OPTIONS } from "@/data/callTypes";
import { cn } from "@/lib/utils";
import {
  getSoundBlob,
  getSoundConfig,
  listSoundConfigs,
  removeSoundConfig,
  saveSoundConfig,
} from "@/services/soundStorageService";
import type { CallSubtype } from "@/types/andon";
import {
  DEFAULT_SOUND_MACHINE_ID,
  type AndonSoundConfig,
  type SoundMachineId,
} from "@/types/sound";
import { DashboardSoundMuteSettings } from "./DashboardSoundMuteSettings";

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

export function SoundsSettingsTab({
  isOpen,
  isActive,
}: {
  isOpen: boolean;
  isActive: boolean;
}) {
  const { machines } = useAndon();
  const [items, setItems] = useState<AndonSoundConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [machineId, setMachineId] = useState<SoundMachineId>(
    DEFAULT_SOUND_MACHINE_ID,
  );
  const [subtype, setSubtype] = useState<CallSubtype>(CALL_TYPE_OPTIONS[0].id);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentConfig, setCurrentConfig] =
    useState<AndonSoundConfig | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] =
    useState<"all" | "default" | "machine">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewSoundId, setPreviewSoundId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const currentPreviewId = `${machineId}:${subtype}`;

  const machineLabelById = useMemo(
    () => new Map(machines.map((machine) => [machine.id, machine.name])),
    [machines],
  );

  const filteredItems = useMemo(() => {
    const query = normalizeSearch(searchQuery);

    return items.filter((item) => {
      const isDefault = item.machineId === DEFAULT_SOUND_MACHINE_ID;
      if (scopeFilter === "default" && !isDefault) return false;
      if (scopeFilter === "machine" && isDefault) return false;
      if (!query) return true;

      const machineLabel = isDefault
        ? "Padrão para todas"
        : `Máquina ${item.machineId} ${machineLabelById.get(item.machineId) ?? ""}`;
      const subtypeLabel =
        CALL_TYPE_OPTIONS.find((option) => option.id === item.subtype)?.label ??
        item.subtype;

      return normalizeSearch(
        `${machineLabel} ${subtypeLabel} ${item.fileName}`,
      ).includes(query);
    });
  }, [items, machineLabelById, scopeFilter, searchQuery]);

  function stopPreview() {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current.onended = null;
      previewAudioRef.current = null;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setIsPreviewPlaying(false);
    setPreviewSoundId(null);
  }

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [list, config] = await Promise.all([
        listSoundConfigs(),
        getSoundConfig(machineId, subtype),
      ]);

      setItems(list);
      setCurrentConfig(config);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os sons.";
      setLoadError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [machineId, subtype]);

  useEffect(() => {
    void refresh().catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os sons.",
      );
    });
  }, [refresh]);

  useEffect(() => {
    if (!isOpen || !isActive) stopPreview();
  }, [isActive, isOpen]);

  useEffect(() => stopPreview, []);

  function handleAddSoundConfig() {
    stopPreview();
    setSelectedId(null);
    setMachineId(DEFAULT_SOUND_MACHINE_ID);
    setSubtype(CALL_TYPE_OPTIONS[0].id);
    setSelectedFile(null);
    setCurrentConfig(null);
  }

  function handleSelect(cfg: AndonSoundConfig) {
    stopPreview();
    setSelectedId(cfg.id);
    setMachineId(cfg.machineId);
    setSubtype(cfg.subtype);
    setSelectedFile(null);
    setCurrentConfig(cfg);
  }

  async function handleSaveSound() {
    if (!selectedFile) {
      toast.error("Selecione um arquivo de áudio para salvar.");
      return;
    }

    if (!/\.(mp3|wav|ogg)$/i.test(selectedFile.name)) {
      toast.error("Formato inválido. Use .mp3, .wav ou .ogg.");
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveSoundConfig(machineId, subtype, selectedFile);
      setSelectedId(saved.id);
      setCurrentConfig(saved);
      setSelectedFile(null);
      await refresh();
      toast.success("Som salvo com sucesso.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar o som.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveSound() {
    if (!currentConfig) return;

    stopPreview();
    setIsSaving(true);
    try {
      await removeSoundConfig(machineId, subtype);
      handleAddSoundConfig();
      await refresh();
      toast.success("Som removido.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível remover o som.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePreviewToggle() {
    if (isPreviewPlaying && previewSoundId === currentPreviewId) {
      stopPreview();
      return;
    }

    stopPreview();
    try {
      const specificBlob = await getSoundBlob(machineId, subtype);
      const fallbackBlob =
        machineId === DEFAULT_SOUND_MACHINE_ID
          ? null
          : await getSoundBlob(DEFAULT_SOUND_MACHINE_ID, subtype);
      const blob = specificBlob ?? fallbackBlob;

      if (!blob) {
        toast.error("Nenhum som configurado para esta seleção.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewUrlRef.current = url;
      previewAudioRef.current = audio;
      setPreviewSoundId(currentPreviewId);

      audio.onended = () => stopPreview();
      await audio.play();
      setIsPreviewPlaying(true);
    } catch (error) {
      stopPreview();
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível reproduzir o som.",
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-bold">Sons do ANDON</h3>
        <p className="text-sm text-muted-foreground">
          Gerencie arquivos por máquina e tipo de chamado.
        </p>
      </div>

      <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
        <p className="text-sm font-black text-foreground">
          Armazenamento local deste terminal
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Os arquivos de áudio desta tela ficam no navegador/terminal atual.
          Configurações feitas aqui não são distribuídas automaticamente para outras workstations.
        </p>
      </div>

      <DashboardSoundMuteSettings />

      <div className="grid gap-4 md:grid-cols-[minmax(300px,380px)_1fr]">
        <Section
          title="Configurações salvas"
          description="Localize sons padrão ou específicos de uma máquina."
        >
          <BigButton
            tone="neutral"
            size="md"
            onClick={handleAddSoundConfig}
            disabled={isSaving}
          >
            Nova configuração de som
          </BigButton>

          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Pesquisar máquina, chamado ou arquivo..."
              aria-label="Pesquisar configurações de som"
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm outline-none transition focus:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Limpar pesquisa de sons"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div
            className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/20 p-1"
            aria-label="Filtrar configurações de som por escopo"
          >
            {(
              [
                ["all", "Todos"],
                ["default", "Padrão"],
                ["machine", "Máquina"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={scopeFilter === value}
                onClick={() => setScopeFilter(value)}
                className={cn(
                  "min-h-9 rounded-md px-2 text-xs font-bold transition-colors",
                  scopeFilter === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
            <span>{filteredItems.length} de {items.length} configuração(ões)</span>
            {(searchQuery || scopeFilter !== "all") && (
              <button
                type="button"
                className="font-bold text-primary hover:underline"
                onClick={() => {
                  setSearchQuery("");
                  setScopeFilter("all");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>

          <div className="min-h-[12rem] max-h-[calc(96dvh-22rem)] space-y-2 overflow-y-auto overscroll-contain pr-2 pb-2">
            {isLoading ? (
              <p className="py-4 text-sm text-muted-foreground">
                Carregando sons...
              </p>
            ) : loadError ? (
              <div
                role="alert"
                className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
              >
                <p>{loadError}</p>
                <button
                  type="button"
                  className="mt-2 font-bold underline"
                  onClick={() => void refresh()}
                >
                  Tentar novamente
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
                <p className="text-sm font-bold">Nenhum som configurado</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
                <p className="text-sm font-bold">Nenhum som encontrado</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ajuste a pesquisa ou o filtro de escopo.
                </p>
              </div>
            ) : (
              filteredItems.map((cfg) => {
                const selected = selectedId === cfg.id;
                const machineLabel =
                  cfg.machineId === DEFAULT_SOUND_MACHINE_ID
                    ? "Padrão para todas"
                    : `Máquina ${cfg.machineId}`;
                const subtypeLabel =
                  CALL_TYPE_OPTIONS.find((option) => option.id === cfg.subtype)
                    ?.label ?? cfg.subtype;

                return (
                  <button
                    key={cfg.id}
                    type="button"
                    onClick={() => handleSelect(cfg)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border hover:bg-accent/50",
                    )}
                  >
                    <p className="text-sm font-black">{machineLabel}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {subtypeLabel} · {cfg.fileName}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Atualizado: {new Date(cfg.updatedAt).toLocaleString("pt-BR")}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </Section>

        <Section
          title={selectedId ? "Editar configuração de som" : "Nova configuração de som"}
          description="O teste usa o som padrão como fallback quando uma máquina não possui arquivo específico."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold">
              Máquina
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-2"
                value={machineId}
                onChange={(event) => {
                  stopPreview();
                  setMachineId(event.target.value);
                  setSelectedFile(null);
                }}
              >
                <option value={DEFAULT_SOUND_MACHINE_ID}>Padrão para todas</option>
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold">
              Tipo de chamado
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-2"
                value={subtype}
                onChange={(event) => {
                  stopPreview();
                  setSubtype(event.target.value as CallSubtype);
                  setSelectedFile(null);
                }}
              >
                {CALL_TYPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Arquivo de áudio</p>
            <input
              id="andon-audio-file-input"
              type="file"
              accept=".mp3,.wav,.ogg"
              className="hidden"
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] ?? null)
              }
            />
            <label
              htmlFor="andon-audio-file-input"
              className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-md border border-border bg-muted px-4 text-base font-black hover:bg-accent"
            >
              Escolher áudio
            </label>
            <p className="text-sm text-muted-foreground">
              {selectedFile ? selectedFile.name : "Nenhum arquivo novo selecionado"}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Arquivo atual
            </p>
            <p className="mt-1 text-sm font-black text-foreground">
              {currentConfig?.fileName ?? "Nenhum som específico configurado"}
            </p>
          </div>

          <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
            <BigButton
              tone="primary"
              size="md"
              onClick={() => void handleSaveSound()}
              disabled={isSaving || !selectedFile}
            >
              {isSaving ? "Salvando..." : "Salvar som"}
            </BigButton>
            <BigButton
              tone="info"
              size="md"
              onClick={() => void handlePreviewToggle()}
              disabled={isSaving}
            >
              {isPreviewPlaying && previewSoundId === currentPreviewId
                ? "Parar teste"
                : "Testar som"}
            </BigButton>
            <BigButton
              tone="neutral"
              size="md"
              onClick={handleAddSoundConfig}
              disabled={isSaving}
            >
              Cancelar
            </BigButton>
            <BigButton
              tone="danger"
              size="md"
              onClick={() => void handleRemoveSound()}
              disabled={isSaving || !currentConfig}
            >
              Remover som
            </BigButton>
          </div>
        </Section>
      </div>
    </div>
  );
}
