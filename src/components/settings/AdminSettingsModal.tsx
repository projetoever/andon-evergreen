import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BigButton } from "@/components/common/BigButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAndon } from "@/context/AndonProvider";
import { CALL_TYPE_OPTIONS } from "@/data/callTypes";
import { cn } from "@/lib/utils";
import { logoutAdmin } from "@/services/adminAuthService";
import { getSoundBlob, getSoundConfig, listSoundConfigs, removeSoundConfig, saveSoundConfig } from "@/services/soundStorageService";
import { DEFAULT_SHIFTS, getShiftConfigs, saveShiftConfigs } from "@/services/shiftConfigService";
import { getTechnicianShiftFilterConfig, saveTechnicianShiftFilterConfig } from "@/services/technicianShiftFilterService";
import type { CallSubtype } from "@/types/andon";
import { DEFAULT_SOUND_MACHINE_ID, type AndonSoundConfig, type SoundMachineId } from "@/types/sound";
import type { FailureClassificationConfig, SettingsTab, ShiftConfig } from "@/types/settings";
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

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "general", label: "Configurações gerais" },
  { id: "sounds", label: "Sons do ANDON" },
  { id: "attendance", label: "Modo de atendimento" },
  { id: "technicians", label: "Manutentores" },
  { id: "categories", label: "Categorias" },
  { id: "shifts", label: "Turnos" },
  { id: "classifications", label: "Classificações" },
  { id: "assetCatalogs", label: "Catálogos de ativos" },
  { id: "machines", label: "Máquinas" },
];

function CardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h4 className="text-sm font-bold uppercase tracking-wide text-foreground">{title}</h4>
      {children}
    </section>
  );
}

export function AdminSettingsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [tab, setTab] = useState<SettingsTab>("general");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações do Sistema</DialogTitle>
          <DialogDescription>Painel administrativo para cadastro e manutenção dos parâmetros do ANDON.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn("min-h-10 rounded-md border px-4 text-sm font-bold", tab === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "general" && <GeneralSettingsTab />}
        {tab === "sounds" && <SoundsTab isOpen={open} isActive={tab === "sounds"} />}
        {tab === "attendance" && <AttendanceModeSettingsTab />}
        {tab === "technicians" && <TechniciansSettingsTab />}
        {tab === "categories" && <CategoriesSettingsTab />}
        {tab === "shifts" && <ShiftsTab />}
        {tab === "classifications" && <ClassificationsTab />}
        {tab === "assetCatalogs" && <MachineAssetCatalogPanel />}
        {tab === "machines" && <MachineAdminPanel />}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <BigButton tone="danger" size="md" onClick={() => { logoutAdmin(); onOpenChange(false); }}>Sair do modo admin</BigButton>
          <BigButton tone="neutral" size="md" onClick={() => onOpenChange(false)}>Fechar</BigButton>
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
    void refresh();
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
    if (!/\.(mp3|wav|ogg)$/i.test(selectedFile.name)) return toast.error("Formato inválido. Use .mp3, .wav ou .ogg.");
    await saveSoundConfig(machineId, subtype, selectedFile);
    toast.success("Som salvo com sucesso.");
    setSelectedFile(null);
    await refresh();
  }

  async function handleRemoveSound() {
    stopPreview();
    await removeSoundConfig(machineId, subtype);
    toast.success("Som removido.");
    handleAddSoundConfig();
    await refresh();
  }

  async function handlePreviewToggle() {
    if (isPreviewPlaying && previewSoundId === currentPreviewId) {
      stopPreview();
      return;
    }

    stopPreview();
    const specificBlob = await getSoundBlob(machineId, subtype);
    const fallbackBlob = machineId === DEFAULT_SOUND_MACHINE_ID ? null : await getSoundBlob(DEFAULT_SOUND_MACHINE_ID, subtype);
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
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1"><h3 className="text-base font-bold">Sons do ANDON</h3><p className="text-sm text-muted-foreground">Gerencie arquivos por máquina e tipo de chamado.</p></div>
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

function ShiftsTab() { const [items,setItems]=useState<ShiftConfig[]>([]); const [selectedId,setSelectedId]=useState<string>("morning"); const [draft,setDraft]=useState<ShiftConfig|null>(null); const [filterByCurrentShift,setFilterByCurrentShift]=useState(true); useEffect(()=>{const list=getShiftConfigs(); setItems(list); const first=list.find((x)=>x.id==="morning")??list[0]; setSelectedId(first.id); setDraft({...first}); setFilterByCurrentShift(getTechnicianShiftFilterConfig().filterByCurrentShift);},[]); const persist=(next:ShiftConfig[])=>{setItems(next);saveShiftConfigs(next)}; const handleSelect=(item:ShiftConfig)=>{setSelectedId(item.id);setDraft({...item})}; const handleAddShift=()=>{setSelectedId(""); setDraft({...DEFAULT_SHIFTS[0],id:"",name:"Novo turno"});}; const handleSave=()=>{if(!draft)return; if(!draft.startTime||!draft.endTime)return toast.error("Informe horário inicial e final."); const normalized={...draft,crossesMidnight:draft.startTime>draft.endTime}; if(!draft.id){ toast.error("Nesta versão, edite apenas turnos existentes."); return;} persist(items.map((x)=>x.id===draft.id?normalized:x)); setDraft(normalized); toast.success("Turno salvo.");}; const handleCancel=()=>{const original=items.find((x)=>x.id===selectedId); if(original)setDraft({...original});}; const handleSaveFilter=(enabled:boolean)=>{ setFilterByCurrentShift(enabled); saveTechnicianShiftFilterConfig({filterByCurrentShift:enabled,updatedAt:new Date().toISOString()}); }; if(!draft)return null;
return <div className="space-y-4"><div className="space-y-1"><h3 className="text-base font-bold">Turnos</h3><p className="text-sm text-muted-foreground">Ajuste horários e status dos turnos, incluindo cruzamento de meia-noite.</p></div><div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]"><CardSection title="Turnos"><BigButton tone="neutral" size="md" onClick={handleAddShift}>Adicionar turno</BigButton><div className="space-y-2">{items.map((item)=><button key={item.id} type="button" onClick={()=>handleSelect(item)} className={cn("w-full rounded-lg border p-3 text-left",selectedId===item.id?"border-primary bg-primary/10":"border-border")}><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-muted-foreground">{item.startTime} às {item.endTime} · {item.active?"Ativo":"Inativo"}</p><p className="text-xs text-muted-foreground">Cruza meia-noite: {item.crossesMidnight?"Sim":"Não"}</p></button>)}</div></CardSection><div className="space-y-4"><CardSection title={selectedId?"Editar turno":"Novo turno"}><label className="text-sm font-semibold">Nome do turno<input value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})} className="mt-1 h-10 w-full rounded-md border bg-background px-2" /></label><div className="grid gap-3 md:grid-cols-2"><label className="text-sm font-semibold">Horário início<input type="time" value={draft.startTime} onChange={(e)=>setDraft({...draft,startTime:e.target.value,crossesMidnight:e.target.value>draft.endTime})} className="mt-1 h-10 w-full rounded-md border bg-background px-2" /></label><label className="text-sm font-semibold">Horário fim<input type="time" value={draft.endTime} onChange={(e)=>setDraft({...draft,endTime:e.target.value,crossesMidnight:draft.startTime>e.target.value})} className="mt-1 h-10 w-full rounded-md border bg-background px-2" /></label></div><label className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm font-semibold"><input type="checkbox" checked={draft.active} onChange={(e)=>setDraft({...draft,active:e.target.checked})}/>Ativo</label><p className="text-sm text-muted-foreground">Cruza meia-noite: <span className="font-bold">{draft.crossesMidnight?"Sim":"Não"}</span></p><div className="flex flex-wrap gap-2 pt-2"><BigButton tone="primary" size="md" onClick={handleSave}>Salvar turno</BigButton><BigButton tone="neutral" size="md" onClick={handleCancel}>Cancelar</BigButton><BigButton tone="danger" size="md" onClick={()=>setDraft((prev)=>prev?{...prev,active:!prev.active}:prev)}>{draft.active?"Inativar":"Ativar"}</BigButton></div></CardSection><CardSection title="Filtro de exibição de manutentores"><label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm font-semibold"><span>Filtrar manutentores pelo turno atual</span><input type="checkbox" checked={filterByCurrentShift} onChange={(e)=>handleSaveFilter(e.target.checked)} /></label><p className="text-sm text-muted-foreground">Quando ativo, a finalização exibe primeiro os manutentores do turno atual. Quando inativo, exibe todos os manutentores ativos.</p><p className="text-xs text-muted-foreground">Estado atual: {filterByCurrentShift?"Ativo":"Inativo"}</p></CardSection></div></div></div>; }

function ClassificationsTab() {
  const [items, setItems] = useState<FailureClassificationConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FailureClassificationConfig>({
    id: "",
    value: "",
    label: "",
    active: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const catalog = await getFailureClassificationConfigs();
      setItems(catalog);
      return catalog;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar classificações.";
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
      toast.error(error instanceof Error ? error.message : "Falha ao salvar classificação.");
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
      toast.success(updated.active ? "Classificação reativada." : "Classificação inativada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar classificação.");
    } finally {
      setIsSaving(false);
    }
  };

  return <div className="space-y-4"><div className="space-y-1"><h3 className="text-base font-bold">Classificações</h3><p className="text-sm text-muted-foreground">Gerencie o catálogo central usado na classificação da ocorrência.</p></div>{loadError&&<div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><p className="font-bold">Não foi possível carregar o catálogo central.</p><p>{loadError}</p><button type="button" className="mt-2 font-bold underline" onClick={()=>void loadCatalog().catch(()=>undefined)}>Tentar novamente</button></div>}<div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]"><CardSection title="Classificações cadastradas"><BigButton tone="neutral" size="md" onClick={handleAddClassification} disabled={isLoading||isSaving||Boolean(loadError)}>Adicionar classificação</BigButton><div className="space-y-2">{isLoading&&<p className="text-sm text-muted-foreground">Carregando catálogo central...</p>}{!isLoading&&!loadError&&items.length===0&&<p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>}{items.map((item)=><button key={item.id} type="button" onClick={()=>handleSelect(item)} className={cn("w-full rounded-lg border p-3 text-left",selectedId===item.id?"border-primary bg-primary/10":"border-border")}><p className="text-sm font-bold">{item.label}</p><p className="text-xs text-muted-foreground">{item.value} · {item.active?"Ativo":"Inativo"}</p></button>)}</div></CardSection><CardSection title={selectedId?"Editar classificação":"Nova classificação"}><label className="text-sm font-semibold">Nome exibido<input className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={draft.label} onChange={(e)=>setDraft({...draft,label:e.target.value})} disabled={isSaving||Boolean(loadError)}/></label><label className="text-sm font-semibold">ID interno<input className="mt-1 h-10 w-full rounded-md border bg-background px-2 disabled:opacity-60" value={draft.value} onChange={(e)=>setDraft({...draft,value:e.target.value})} placeholder="ex: pneumatic_failure" disabled={Boolean(selectedId)||isSaving||Boolean(loadError)}/></label>{selectedId&&<p className="text-xs text-muted-foreground">O ID interno permanece estável para preservar o histórico.</p>}<label className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm font-semibold"><input type="checkbox" checked={draft.active} onChange={(e)=>setDraft({...draft,active:e.target.checked})} disabled={isSaving||Boolean(loadError)}/>Ativo</label><div className="flex flex-wrap gap-2 pt-2"><BigButton tone="primary" size="md" onClick={()=>void handleSave()} disabled={isSaving||Boolean(loadError)}>{isSaving?"Salvando...":"Salvar classificação"}</BigButton><BigButton tone="neutral" size="md" onClick={handleCancel} disabled={isSaving}>Cancelar</BigButton><BigButton tone="danger" size="md" onClick={()=>void handleToggleActive()} disabled={!selectedId||isSaving||Boolean(loadError)}>{draft.active?"Inativar":"Reativar"}</BigButton></div></CardSection></div></div>;
}
