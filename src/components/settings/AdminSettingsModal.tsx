import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Boxes,
  Clock3,
  Factory,
  Headphones,
  ListChecks,
  LogOut,
  MonitorCog,
  Search,
  Settings2,
  ShieldCheck,
  Tags,
  UserRoundCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { BigButton } from "@/components/common/BigButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAndon } from "@/context/AndonProvider";
import { CALL_TYPE_OPTIONS } from "@/data/callTypes";
import { cn } from "@/lib/utils";
import { logoutAdmin } from "@/services/adminAuthService";
import { getSoundBlob, getSoundConfig, listSoundConfigs, removeSoundConfig, saveSoundConfig } from "@/services/soundStorageService";
import type { CallSubtype } from "@/types/andon";
import { DEFAULT_SOUND_MACHINE_ID, type AndonSoundConfig, type SoundMachineId } from "@/types/sound";
import type { FailureClassificationConfig, SettingsTab } from "@/types/settings";
import { toast } from "sonner";
import {
  createFailureClassification,
  getFailureClassificationConfigs,
  updateFailureClassification,
} from "@/services/failureClassificationConfigService";
import { MachineAdminPanel } from "./MachineAdminPanel";
import { MachineAssetCatalogPanel } from "./MachineAssetCatalogPanel";
import { TechniciansSettingsTab } from "./TechniciansSettingsTab";
import { AttendanceModeSettingsTab } from "./AttendanceModeSettingsTab";
import { CategoriesSettingsTab } from "./CategoriesSettingsTab";
import { GeneralSettingsTab } from "./GeneralSettingsTab";
import { WorkstationsSettingsTab } from "./WorkstationsSettingsTab";
import { DashboardSoundMuteSettings } from "./DashboardSoundMuteSettings";
import { ShiftsSettingsTab } from "./ShiftsSettingsTab";

type AdminNavigationGroup = "Sistema" | "Operação" | "Cadastros" | "Infraestrutura";

interface AdminNavigationItem {
  id: SettingsTab;
  label: string;
  description: string;
  group: AdminNavigationGroup;
  icon: LucideIcon;
}

const tabs: AdminNavigationItem[] = [
  {
    id: "general",
    label: "Configurações gerais",
    description: "Preferências globais, regras operacionais e segurança administrativa.",
    group: "Sistema",
    icon: Settings2,
  },
  {
    id: "sounds",
    label: "Sons do ANDON",
    description: "Áudios, comportamento sonoro e temporizador de silêncio do dashboard.",
    group: "Sistema",
    icon: Headphones,
  },
  {
    id: "attendance",
    label: "Modo de atendimento",
    description: "Identificação por nome, PIN ou RFID e parâmetros de credencial.",
    group: "Operação",
    icon: UserRoundCheck,
  },
  {
    id: "technicians",
    label: "Mantenedores",
    description: "Cadastro, áreas técnicas, turnos e credenciais dos mantenedores.",
    group: "Operação",
    icon: Users,
  },
  {
    id: "shifts",
    label: "Turnos",
    description: "Horários dos turnos e regras de exibição por jornada.",
    group: "Operação",
    icon: Clock3,
  },
  {
    id: "categories",
    label: "Setores / categorias",
    description: "Áreas exibidas na abertura dos chamados e sua organização visual.",
    group: "Cadastros",
    icon: Tags,
  },
  {
    id: "classifications",
    label: "Classificações",
    description: "Catálogo central de classificações utilizadas no diagnóstico.",
    group: "Cadastros",
    icon: ListChecks,
  },
  {
    id: "assetCatalogs",
    label: "Catálogos de ativos",
    description: "Tipos de conjuntos e subconjuntos utilizados na localização de falhas.",
    group: "Cadastros",
    icon: Boxes,
  },
  {
    id: "machines",
    label: "Máquinas",
    description: "Cadastro e parâmetros individuais das máquinas do ANDON.",
    group: "Infraestrutura",
    icon: Factory,
  },
  {
    id: "workstations",
    label: "Workstations",
    description: "Identidades, nomes e estado das estações conectadas ao sistema.",
    group: "Infraestrutura",
    icon: MonitorCog,
  },
];

const navigationGroups: AdminNavigationGroup[] = [
  "Sistema",
  "Operação",
  "Cadastros",
  "Infraestrutura",
];

function CardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h4 className="text-sm font-bold uppercase tracking-wide text-foreground">{title}</h4>
      {children}
    </section>
  );
}

export function AdminSettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("general");
  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];
  const ActiveIcon = activeTab.icon;

  const renderTab = () => {
    if (tab === "general") return <GeneralSettingsTab />;
    if (tab === "sounds") return <SoundsTab isOpen={open} isActive={tab === "sounds"} />;
    if (tab === "attendance") return <AttendanceModeSettingsTab />;
    if (tab === "technicians") return <TechniciansSettingsTab />;
    if (tab === "categories") return <CategoriesSettingsTab />;
    if (tab === "shifts") return <ShiftsSettingsTab />;
    if (tab === "classifications") return <ClassificationsTab />;
    if (tab === "assetCatalogs") return <MachineAssetCatalogPanel />;
    if (tab === "machines") return <MachineAdminPanel />;
    if (tab === "workstations") return <WorkstationsSettingsTab />;
    return null;
  };

  const handleAdminLogout = () => {
    logoutAdmin();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideDefaultClose
        onPointerDownOutside={(event) => event.preventDefault()}
        className="h-[96dvh] max-h-[96dvh] w-[calc(100vw-1rem)] max-w-[1600px] gap-0 overflow-hidden rounded-2xl border-border/80 bg-background p-0 shadow-2xl sm:w-[96vw]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Painel administrativo do ANDON</DialogTitle>
          <DialogDescription>
            Configurações, cadastros e infraestrutura do ANDON Web Industrial.
          </DialogDescription>
        </DialogHeader>

        <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
          <aside className="hidden min-h-0 border-r border-border bg-card/50 lg:flex lg:flex-col">
            <div className="border-b border-border px-5 py-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <ShieldCheck className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                    ANDON
                  </p>
                  <p className="truncate text-base font-black text-foreground">
                    Painel administrativo
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Configuração controlada do ANDON Web Industrial.
              </p>
            </div>

            <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
              {navigationGroups.map((group) => (
                <div key={group} className="space-y-1">
                  <p className="px-3 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    {group}
                  </p>
                  {tabs
                    .filter((item) => item.group === group)
                    .map((item) => {
                      const Icon = item.icon;
                      const active = item.id === tab;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-current={active ? "page" : undefined}
                          onClick={() => setTab(item.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                            active
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                        >
                          <Icon className="h-4.5 w-4.5 shrink-0" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{item.label}</span>
                          </span>
                        </button>
                      );
                    })}
                </div>
              ))}
            </nav>

            <div className="border-t border-border p-3">
              <button
                type="button"
                onClick={handleAdminLogout}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-danger transition-colors hover:bg-danger/10"
              >
                <LogOut className="h-4 w-4" />
                Sair do modo admin
              </button>
            </div>
          </aside>

          <header className="flex items-center justify-between gap-3 border-b border-border bg-card/70 px-4 py-3 lg:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                  ANDON
                </p>
                <p className="truncate text-sm font-black">Painel administrativo</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Fechar painel administrativo"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <nav className="flex gap-2 overflow-x-auto border-b border-border bg-background px-3 py-2 lg:hidden">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = item.id === tab;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-bold",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <main className="flex min-h-0 min-w-0 flex-col lg:col-start-2 lg:row-start-1">
            <div className="hidden shrink-0 items-start justify-between gap-6 border-b border-border bg-background/95 px-7 py-5 lg:flex">
              <div className="flex min-w-0 items-start gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <ActiveIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {activeTab.group}
                  </p>
                  <h2 className="mt-0.5 text-2xl font-black tracking-tight text-foreground">
                    {activeTab.label}
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    {activeTab.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar painel administrativo"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-3 lg:hidden">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ActiveIcon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {activeTab.group}
                  </p>
                  <h2 className="font-black text-foreground">{activeTab.label}</h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {activeTab.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-3 sm:p-4 lg:p-6 xl:p-8">
              <div className="mx-auto w-full max-w-[1240px]">{renderTab()}</div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-background px-3 py-2 lg:hidden">
              <BigButton tone="danger" size="md" onClick={handleAdminLogout}>
                Sair do modo admin
              </BigButton>
              <BigButton tone="neutral" size="md" onClick={() => onOpenChange(false)}>
                Fechar
              </BigButton>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SoundsTab({ isOpen, isActive }: { isOpen: boolean; isActive: boolean }) {
  const { machines } = useAndon();
  const [items, setItems] = useState<AndonSoundConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [machineId, setMachineId] = useState<SoundMachineId>(DEFAULT_SOUND_MACHINE_ID);
  const [subtype, setSubtype] = useState(CALL_TYPE_OPTIONS[0].id);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentConfig, setCurrentConfig] = useState<AndonSoundConfig | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewSoundId, setPreviewSoundId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const currentPreviewId = `${machineId}:${subtype}`;

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
    const [list, config] = await Promise.all([
      listSoundConfigs(),
      getSoundConfig(machineId, subtype),
    ]);

    setItems(list);
    setCurrentConfig(config);
  }, [machineId, subtype]);

  useEffect(() => {
    void refresh().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os sons.");
    });
  }, [refresh]);
  useEffect(() => { if (!isOpen || !isActive) stopPreview(); }, [isOpen, isActive]);
  useEffect(() => stopPreview, []);

  function handleAddSoundConfig() {
    stopPreview();
    setSelectedId(null);
    setMachineId(DEFAULT_SOUND_MACHINE_ID);
    setSubtype(CALL_TYPE_OPTIONS[0].id);
    setSelectedFile(null);
    setCurrentConfig(null);
  }

  async function handleSaveSound() {
    if (!selectedFile) return toast.error("Selecione um arquivo de áudio para salvar.");
    if (!/\.(mp3|wav|ogg)$/i.test(selectedFile.name)) {
      return toast.error("Formato inválido. Use .mp3, .wav ou .ogg.");
    }

    try {
      await saveSoundConfig(machineId, subtype, selectedFile);
      setSelectedFile(null);
      await refresh();
      toast.success("Som salvo com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o som.");
    }
  }

  async function handleRemoveSound() {
    stopPreview();
    try {
      await removeSoundConfig(machineId, subtype);
      handleAddSoundConfig();
      await refresh();
      toast.success("Som removido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o som.");
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
      if (!blob) return toast.error("Nenhum som configurado para esta seleção.");

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
      toast.error(error instanceof Error ? error.message : "Não foi possível reproduzir o som.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1"><h3 className="text-base font-bold">Sons do ANDON</h3><p className="text-sm text-muted-foreground">Gerencie arquivos por máquina e tipo de chamado.</p></div>
      <DashboardSoundMuteSettings />
      <div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]">
        <CardSection title="Configurações salvas">
          <BigButton tone="neutral" size="md" onClick={handleAddSoundConfig}>Adicionar configuração de som</BigButton>
          <div className="space-y-2">
            {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>}
            {items.map((cfg) => (
              <button key={cfg.id} type="button" onClick={async () => { stopPreview(); setSelectedId(cfg.id); setMachineId(cfg.machineId); setSubtype(cfg.subtype); setSelectedFile(null); setCurrentConfig(await getSoundConfig(cfg.machineId, cfg.subtype)); }} className={cn("w-full rounded-lg border p-3 text-left", selectedId === cfg.id ? "border-primary bg-primary/10" : "border-border")}>
                <p className="text-sm font-bold">{cfg.machineId === "default" ? "Padrão para todas" : `Máquina ${cfg.machineId}`}</p>
                <p className="text-xs text-muted-foreground">{CALL_TYPE_OPTIONS.find((o) => o.id === cfg.subtype)?.label ?? cfg.subtype} · {cfg.fileName}</p>
                <p className="text-xs text-muted-foreground">Atualizado: {new Date(cfg.updatedAt).toLocaleString("pt-BR")}</p>
              </button>
            ))}
          </div>
        </CardSection>

        <CardSection title={selectedId ? "Editar configuração de som" : "Nova configuração de som"}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold">Máquina<select className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={machineId} onChange={(e) => setMachineId(e.target.value)}><option value="default">Padrão para todas</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label className="text-sm font-semibold">Tipo de chamado<select className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={subtype} onChange={(e) => setSubtype(e.target.value as CallSubtype)}>{CALL_TYPE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Arquivo de áudio</p>
            <input id="andon-audio-file-input" type="file" accept=".mp3,.wav,.ogg" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
            <label htmlFor="andon-audio-file-input" className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-md border border-border bg-muted px-4 text-lg font-black hover:bg-accent">
              + Escolher áudio
            </label>
            <p className="text-sm text-muted-foreground">{selectedFile ? selectedFile.name : "Nenhum arquivo selecionado"}</p>
          </div>
          <p className="text-sm text-muted-foreground">Arquivo atual: {currentConfig?.fileName ?? "Nenhum som configurado"}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <BigButton tone="primary" size="md" onClick={() => void handleSaveSound()}>Salvar som</BigButton>
            <BigButton tone="info" size="md" onClick={() => void handlePreviewToggle()}>{isPreviewPlaying && previewSoundId === currentPreviewId ? "Parar teste" : "Testar som"}</BigButton>
            <BigButton tone="neutral" size="md" onClick={handleAddSoundConfig}>Cancelar</BigButton>
            <BigButton tone="danger" size="md" onClick={() => void handleRemoveSound()}>Remover som</BigButton>
          </div>
        </CardSection>
      </div>
    </div>
  );
}

function ClassificationsTab() {
  const [items, setItems] = useState<FailureClassificationConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FailureClassificationConfig>({
    id: "",
    value: "",
    label: "",
    active: true,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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

      const haystack = `${item.label} ${item.value}`
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      return haystack.includes(normalizedQuery);
    });
  }, [items, searchQuery, statusFilter]);

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const catalog = await getFailureClassificationConfigs();
      setItems(catalog);
      return catalog;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao carregar classificações.";
      setLoadError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog().catch(() => undefined);
  }, [loadCatalog]);

  const handleAddClassification = () => {
    setSelectedId(null);
    setDraft({ id: "", value: "", label: "", active: true });
  };

  const handleSelect = (item: FailureClassificationConfig) => {
    setSelectedId(item.id);
    setDraft({ ...item });
  };

  const handleSave = async () => {
    if (!draft.label.trim()) return toast.error("Informe o nome exibido.");

    const value = (draft.value.trim() || draft.label)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    if (!value || !/^[a-z0-9_]+$/.test(value)) {
      return toast.error("ID interno inválido. Use minúsculas e underscore.");
    }

    setIsSaving(true);
    try {
      const saved = selectedId
        ? await updateFailureClassification(selectedId, {
            label: draft.label.trim(),
            active: draft.active,
          })
        : await createFailureClassification({
            label: draft.label.trim(),
            value,
            active: draft.active,
          });

      const catalog = await loadCatalog();
      const refreshed = catalog.find((item) => item.id === saved.id) ?? saved;
      setSelectedId(refreshed.id);
      setDraft({ ...refreshed });
      toast.success("Classificação salva no catálogo central.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao salvar classificação.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (!selectedId) return handleAddClassification();
    const found = items.find((item) => item.id === selectedId);
    if (found) setDraft({ ...found });
  };

  const handleToggleActive = async () => {
    if (!selectedId) return;

    setIsSaving(true);
    try {
      const updated = await updateFailureClassification(selectedId, {
        active: !draft.active,
      });
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setDraft({ ...updated });
      toast.success(
        updated.active ? "Classificação reativada." : "Classificação inativada.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao atualizar classificação.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-bold">Classificações</h3>
        <p className="text-sm text-muted-foreground">
          Gerencie o catálogo central usado na classificação da ocorrência.
        </p>
      </div>

      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <p className="font-bold">Não foi possível carregar o catálogo central.</p>
          <p>{loadError}</p>
          <button
            type="button"
            className="mt-2 font-bold underline"
            onClick={() => void loadCatalog().catch(() => undefined)}
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(300px,380px)_1fr]">
        <CardSection title="Classificações cadastradas">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {filteredItems.length} de {items.length} classificação(ões)
            </p>
            <BigButton
              tone="neutral"
              size="md"
              onClick={handleAddClassification}
              disabled={isLoading || isSaving || Boolean(loadError)}
            >
              Adicionar classificação
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
              aria-label="Pesquisar classificações por nome ou ID"
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm outline-none transition focus:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Limpar pesquisa de classificações"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div
            className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/20 p-1"
            aria-label="Filtrar classificações por status"
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
              <p className="py-4 text-sm text-muted-foreground">
                Carregando catálogo central...
              </p>
            )}

            {!isLoading && !loadError && items.length === 0 && (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
                <p className="text-sm font-bold">Nenhuma classificação cadastrada</p>
              </div>
            )}

            {!isLoading &&
              !loadError &&
              items.length > 0 &&
              filteredItems.length === 0 && (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
                  <p className="text-sm font-bold">Nenhuma classificação encontrada</p>
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
                  "w-full rounded-lg border p-3 text-left transition-colors",
                  selectedId === item.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent/50",
                  !item.active && "opacity-65",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{item.label}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {item.value}
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
                    {item.active ? "Ativa" : "Inativa"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </CardSection>

        <CardSection title={selectedId ? "Editar classificação" : "Nova classificação"}>
          <label className="text-sm font-semibold">
            Nome exibido
            <input
              className="mt-1 h-10 w-full rounded-md border bg-background px-2"
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              disabled={isSaving || Boolean(loadError)}
            />
          </label>

          <label className="text-sm font-semibold">
            ID interno
            <input
              className="mt-1 h-10 w-full rounded-md border bg-background px-2 disabled:opacity-60"
              value={draft.value}
              onChange={(event) => setDraft({ ...draft, value: event.target.value })}
              placeholder="ex: pneumatic_failure"
              disabled={Boolean(selectedId) || isSaving || Boolean(loadError)}
            />
          </label>

          {selectedId && (
            <p className="text-xs text-muted-foreground">
              O ID interno permanece estável para preservar o histórico.
            </p>
          )}

          <label className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
              disabled={isSaving || Boolean(loadError)}
            />
            Ativo
          </label>

          <div className="flex flex-wrap gap-2 pt-2">
            <BigButton
              tone="primary"
              size="md"
              onClick={() => void handleSave()}
              disabled={isSaving || Boolean(loadError)}
            >
              {isSaving ? "Salvando..." : "Salvar classificação"}
            </BigButton>
            <BigButton
              tone="neutral"
              size="md"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancelar
            </BigButton>
            <BigButton
              tone="danger"
              size="md"
              onClick={() => void handleToggleActive()}
              disabled={!selectedId || isSaving || Boolean(loadError)}
            >
              {draft.active ? "Inativar" : "Reativar"}
            </BigButton>
          </div>
        </CardSection>
      </div>
    </div>
  );
}

