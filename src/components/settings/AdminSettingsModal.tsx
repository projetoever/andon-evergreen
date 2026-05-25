import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BigButton } from "@/components/common/BigButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAndon } from "@/context/AndonProvider";
import { CALL_TYPE_OPTIONS } from "@/data/callTypes";
import { cn } from "@/lib/utils";
import { logoutAdmin } from "@/services/adminAuthService";
import { getCategoryConfigs, saveCategoryConfigs } from "@/services/categoryConfigService";
import { getSoundBlob, getSoundConfig, listSoundConfigs, removeSoundConfig, saveSoundConfig } from "@/services/soundStorageService";
import { DEFAULT_SHIFTS, getShiftConfigs, saveShiftConfigs } from "@/services/shiftConfigService";
import { getTechnicianConfigs, saveTechnicianConfigs } from "@/services/technicianConfigService";
import type { CallSubtype } from "@/types/andon";
import { DEFAULT_SOUND_MACHINE_ID, type AndonSoundConfig, type SoundMachineId } from "@/types/sound";
import type { AndonCategoryConfig, FailureClassificationConfig, SettingsTab, ShiftConfig, TechnicianConfig } from "@/types/settings";
import { toast } from "sonner";
import { getFailureClassificationConfigs, saveFailureClassificationConfigs } from "@/services/failureClassificationConfigService";

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "sounds", label: "Sons do ANDON" },
  { id: "technicians", label: "Manutentores" },
  { id: "categories", label: "Categorias" },
  { id: "shifts", label: "Turnos" },
  { id: "classifications", label: "Classificações" },
];

const areaOptions: Array<{ id: CallSubtype; label: string }> = [
  { id: "electrical", label: "Elétrica" },
  { id: "mechanical", label: "Mecânica" },
  { id: "hot_melt", label: "Hot Melt" },
  { id: "quality", label: "Qualidade" },
  { id: "leadership", label: "Liderança" },
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
  const [tab, setTab] = useState<SettingsTab>("sounds");

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

        {tab === "sounds" && <SoundsTab isOpen={open} isActive={tab === "sounds"} />}
        {tab === "technicians" && <TechniciansTab />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "shifts" && <ShiftsTab />}
        {tab === "classifications" && <ClassificationsTab />}

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

  async function refresh() {
    const [list, config] = await Promise.all([listSoundConfigs(), getSoundConfig(machineId, subtype)]);
    setItems(list);
    setCurrentConfig(config);
  }

  useEffect(() => { void refresh(); }, [machineId, subtype]);
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
            <label className="text-sm font-semibold">Tipo de chamado<select className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={subtype} onChange={(e) => setSubtype(e.target.value as any)}>{CALL_TYPE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          </div>
          <label className="text-sm font-semibold">Arquivo de áudio<input type="file" accept=".mp3,.wav,.ogg" className="mt-1 block w-full text-sm" onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} /></label>
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

function TechniciansTab() { const [items,setItems]=useState<TechnicianConfig[]>([]); const [selectedId,setSelectedId]=useState<string|null>(null); const emptyDraft:TechnicianConfig={id:"",name:"",area:"electrical",shifts:[],active:true}; const [draft,setDraft]=useState<TechnicianConfig>(emptyDraft); useEffect(()=>setItems(getTechnicianConfigs()),[]); const shiftNameById=useMemo(()=>Object.fromEntries(DEFAULT_SHIFTS.map((s)=>[s.id,s.name])),[]); const handleAddTechnician=()=>{setSelectedId(null);setDraft(emptyDraft)}; const handleSelect=(item:TechnicianConfig)=>{setSelectedId(item.id);setDraft({...item})}; const persist=(next:TechnicianConfig[])=>{setItems(next);saveTechnicianConfigs(next)}; const handleSave=()=>{const trimmed=draft.name.trim(); if(!trimmed)return toast.error("Informe o nome do manutentor."); const duplicate=items.some((t)=>t.id!==draft.id&&t.name.trim().toLowerCase()===trimmed.toLowerCase()); if(duplicate)return toast.error("Já existe manutentor com este nome."); const id=draft.id||`tech-${Date.now()}`; const nextItem={...draft,id,name:trimmed}; const next=[...items.filter((t)=>t.id!==id),nextItem].sort((a,b)=>a.name.localeCompare(b.name)); persist(next); setSelectedId(id); setDraft(nextItem); toast.success("Manutentor salvo.");}; const handleToggleActive=()=>{ if(!draft.id)return; const next=items.map((t)=>(t.id===draft.id?{...t,active:!t.active}:t)); persist(next); setDraft((prev)=>({...prev,active:!prev.active}));};
return <div className="space-y-4"><div className="space-y-1"><h3 className="text-base font-bold">Manutentores</h3><p className="text-sm text-muted-foreground">Cadastre, edite e inative manutentores por área e turno.</p></div><div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]"><CardSection title="Manutentores cadastrados"><BigButton tone="neutral" size="md" onClick={handleAddTechnician}>Adicionar manutentor</BigButton><div className="space-y-2">{items.length===0&&<p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>}{items.map((item)=><button key={item.id} type="button" onClick={()=>handleSelect(item)} className={cn("w-full rounded-lg border p-3 text-left",selectedId===item.id?"border-primary bg-primary/10":"border-border")}><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-muted-foreground">{areaOptions.find((a)=>a.id===item.area)?.label} · {(item.shifts.length?item.shifts.map((shiftId)=>shiftNameById[shiftId]).join(", "):"Sem turnos")}</p><p className="text-xs text-muted-foreground">{item.active?"Ativo":"Inativo"}</p></button>)}</div></CardSection><CardSection title={selectedId?"Editar manutentor":"Novo manutentor"}><label className="text-sm font-semibold">Nome do manutentor<input className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})}/></label><label className="text-sm font-semibold">Área técnica<select className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={draft.area} onChange={(e)=>setDraft({...draft,area:e.target.value as CallSubtype})}>{areaOptions.map((area)=><option key={area.id} value={area.id}>{area.label}</option>)}</select></label><div className="space-y-2"><p className="text-sm font-semibold">Turnos</p><div className="grid grid-cols-2 gap-2">{DEFAULT_SHIFTS.map((shift)=><label key={shift.id} className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm"><input type="checkbox" checked={draft.shifts.includes(shift.id)} onChange={()=>setDraft((prev)=>({...prev,shifts:prev.shifts.includes(shift.id)?prev.shifts.filter((id)=>id!==shift.id):[...prev.shifts,shift.id]}))}/>{shift.name}</label>)}</div></div><label className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm font-semibold"><input type="checkbox" checked={draft.active} onChange={(e)=>setDraft({...draft,active:e.target.checked})}/>Ativo</label><div className="flex flex-wrap gap-2 pt-2"><BigButton tone="primary" size="md" onClick={handleSave}>Salvar manutentor</BigButton><BigButton tone="neutral" size="md" onClick={handleAddTechnician}>Cancelar</BigButton><BigButton tone="danger" size="md" onClick={handleToggleActive} disabled={!draft.id}>{draft.active?"Inativar":"Reativar"}</BigButton></div></CardSection></div></div>; }

function CategoriesTab() { const [items,setItems]=useState<AndonCategoryConfig[]>([]); const [selectedId,setSelectedId]=useState<string>("electrical"); const [draft,setDraft]=useState<AndonCategoryConfig|null>(null); useEffect(()=>{const list=getCategoryConfigs(); setItems(list); const first=list.find((x)=>x.id==="electrical")??list[0]; setSelectedId(first.id); setDraft({...first});},[]); const persist=(next:AndonCategoryConfig[])=>{setItems(next);saveCategoryConfigs(next)}; const handleSelect=(item:AndonCategoryConfig)=>{setSelectedId(item.id);setDraft({...item})}; const handleSave=()=>{if(!draft)return; persist(items.map((x)=>x.id===draft.id?draft:x)); toast.success("Categoria salva.");}; const handleCancel=()=>{const original=items.find((x)=>x.id===selectedId); if(original)setDraft({...original});}; if(!draft)return null;
return <div className="space-y-4"><div className="space-y-1"><h3 className="text-base font-bold">Categorias</h3><p className="text-sm text-muted-foreground">Edite nome exibido e status das categorias base sem alterar IDs internos.</p></div><div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]"><CardSection title="Categorias"><BigButton tone="neutral" size="md" disabled>Adicionar categoria (em breve)</BigButton><div className="space-y-2">{items.map((item)=><button key={item.id} type="button" onClick={()=>handleSelect(item)} className={cn("w-full rounded-lg border p-3 text-left",selectedId===item.id?"border-primary bg-primary/10":"border-border")}><p className="text-sm font-bold">{item.displayName}</p><p className="text-xs text-muted-foreground">ID: {item.id} · {item.active?"Ativo":"Inativo"}</p></button>)}</div></CardSection><CardSection title="Editar categoria"><label className="text-sm font-semibold">ID interno<input readOnly value={draft.id} className="mt-1 h-10 w-full rounded-md border bg-muted px-2 text-muted-foreground" /></label><label className="text-sm font-semibold">Nome exibido<input value={draft.displayName} onChange={(e)=>setDraft({...draft,displayName:e.target.value})} className="mt-1 h-10 w-full rounded-md border bg-background px-2" /></label><label className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm font-semibold"><input type="checkbox" checked={draft.active} onChange={(e)=>setDraft({...draft,active:e.target.checked})}/>Ativo</label><div className="flex flex-wrap gap-2 pt-2"><BigButton tone="primary" size="md" onClick={handleSave}>Salvar categoria</BigButton><BigButton tone="neutral" size="md" onClick={handleCancel}>Cancelar</BigButton><BigButton tone="danger" size="md" onClick={()=>setDraft((prev)=>prev?{...prev,active:!prev.active}:prev)}>{draft.active?"Inativar":"Ativar"}</BigButton></div></CardSection></div></div>; }

function ShiftsTab() { const [items,setItems]=useState<ShiftConfig[]>([]); const [selectedId,setSelectedId]=useState<string>("morning"); const [draft,setDraft]=useState<ShiftConfig|null>(null); useEffect(()=>{const list=getShiftConfigs(); setItems(list); const first=list.find((x)=>x.id==="morning")??list[0]; setSelectedId(first.id); setDraft({...first});},[]); const persist=(next:ShiftConfig[])=>{setItems(next);saveShiftConfigs(next)}; const handleSelect=(item:ShiftConfig)=>{setSelectedId(item.id);setDraft({...item})}; const handleAddShift=()=>{setSelectedId(""); setDraft({...DEFAULT_SHIFTS[0],id:"",name:"Novo turno"});}; const handleSave=()=>{if(!draft)return; if(!draft.startTime||!draft.endTime)return toast.error("Informe horário inicial e final."); const normalized={...draft,crossesMidnight:draft.startTime>draft.endTime}; if(!draft.id){ toast.error("Nesta versão, edite apenas turnos existentes."); return;} persist(items.map((x)=>x.id===draft.id?normalized:x)); setDraft(normalized); toast.success("Turno salvo.");}; const handleCancel=()=>{const original=items.find((x)=>x.id===selectedId); if(original)setDraft({...original});}; if(!draft)return null;
return <div className="space-y-4"><div className="space-y-1"><h3 className="text-base font-bold">Turnos</h3><p className="text-sm text-muted-foreground">Ajuste horários e status dos turnos, incluindo cruzamento de meia-noite.</p></div><div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]"><CardSection title="Turnos"><BigButton tone="neutral" size="md" onClick={handleAddShift}>Adicionar turno</BigButton><div className="space-y-2">{items.map((item)=><button key={item.id} type="button" onClick={()=>handleSelect(item)} className={cn("w-full rounded-lg border p-3 text-left",selectedId===item.id?"border-primary bg-primary/10":"border-border")}><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-muted-foreground">{item.startTime} às {item.endTime} · {item.active?"Ativo":"Inativo"}</p><p className="text-xs text-muted-foreground">Cruza meia-noite: {item.crossesMidnight?"Sim":"Não"}</p></button>)}</div></CardSection><CardSection title={selectedId?"Editar turno":"Novo turno"}><label className="text-sm font-semibold">Nome do turno<input value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})} className="mt-1 h-10 w-full rounded-md border bg-background px-2" /></label><div className="grid gap-3 md:grid-cols-2"><label className="text-sm font-semibold">Horário início<input type="time" value={draft.startTime} onChange={(e)=>setDraft({...draft,startTime:e.target.value,crossesMidnight:e.target.value>draft.endTime})} className="mt-1 h-10 w-full rounded-md border bg-background px-2" /></label><label className="text-sm font-semibold">Horário fim<input type="time" value={draft.endTime} onChange={(e)=>setDraft({...draft,endTime:e.target.value,crossesMidnight:draft.startTime>e.target.value})} className="mt-1 h-10 w-full rounded-md border bg-background px-2" /></label></div><label className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm font-semibold"><input type="checkbox" checked={draft.active} onChange={(e)=>setDraft({...draft,active:e.target.checked})}/>Ativo</label><p className="text-sm text-muted-foreground">Cruza meia-noite: <span className="font-bold">{draft.crossesMidnight?"Sim":"Não"}</span></p><div className="flex flex-wrap gap-2 pt-2"><BigButton tone="primary" size="md" onClick={handleSave}>Salvar turno</BigButton><BigButton tone="neutral" size="md" onClick={handleCancel}>Cancelar</BigButton><BigButton tone="danger" size="md" onClick={()=>setDraft((prev)=>prev?{...prev,active:!prev.active}:prev)}>{draft.active?"Inativar":"Ativar"}</BigButton></div></CardSection></div></div>; }


function ClassificationsTab() {
  const [items, setItems] = useState<FailureClassificationConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FailureClassificationConfig>({ id: "", label: "", isActive: true });
  useEffect(() => { setItems(getFailureClassificationConfigs()); }, []);
  const persist = (next: FailureClassificationConfig[]) => { setItems(next); saveFailureClassificationConfigs(next); };
  const handleAddClassification = () => { setSelectedId(null); setDraft({ id: "", label: "", isActive: true }); };
  const handleSelect = (item: FailureClassificationConfig) => { setSelectedId(item.id); setDraft({ ...item }); };
  const handleSave = () => {
    if (!draft.label.trim()) return toast.error("Informe o nome exibido.");
    const id = draft.id.trim() || draft.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!id) return toast.error("Informe um ID interno válido.");
    if (!/^[a-z0-9_]+$/.test(id)) return toast.error("ID interno inválido. Use minúsculas e underscore.");
    const duplicate = items.some((item) => item.id === id && item.id !== selectedId);
    if (duplicate) return toast.error("Já existe classificação com este ID.");
    const nextItem = { ...draft, id, label: draft.label.trim(), updatedAt: new Date().toISOString(), createdAt: draft.createdAt ?? new Date().toISOString() };
    persist([...items.filter((item) => item.id !== selectedId), nextItem].sort((a,b)=>a.label.localeCompare(b.label)));
    setSelectedId(id);
    setDraft(nextItem);
    toast.success("Classificação salva.");
  };
  const handleCancel = () => {
    if (!selectedId) return handleAddClassification();
    const found = items.find((item) => item.id === selectedId);
    if (found) setDraft({ ...found });
  };
  const handleToggleActive = () => {
    if (!selectedId) return;
    const next = items.map((item) => item.id === selectedId ? { ...item, isActive: !item.isActive, updatedAt: new Date().toISOString() } : item);
    persist(next);
    const found = next.find((item) => item.id === selectedId);
    if (found) setDraft({ ...found });
  };

  return <div className="space-y-4"><div className="space-y-1"><h3 className="text-base font-bold">Classificações</h3><p className="text-sm text-muted-foreground">Gerencie as opções usadas na classificação da ocorrência.</p></div><div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]"><CardSection title="Classificações cadastradas"><BigButton tone="neutral" size="md" onClick={handleAddClassification}>Adicionar classificação</BigButton><div className="space-y-2">{items.length===0&&<p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>}{items.map((item)=><button key={item.id} type="button" onClick={()=>handleSelect(item)} className={cn("w-full rounded-lg border p-3 text-left",selectedId===item.id?"border-primary bg-primary/10":"border-border")}><p className="text-sm font-bold">{item.label}</p><p className="text-xs text-muted-foreground">{item.id} · {item.isActive?"Ativo":"Inativo"}</p></button>)}</div></CardSection><CardSection title={selectedId?"Editar classificação":"Nova classificação"}><label className="text-sm font-semibold">Nome exibido<input className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={draft.label} onChange={(e)=>setDraft({...draft,label:e.target.value})}/></label><label className="text-sm font-semibold">ID interno<input className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={draft.id} onChange={(e)=>setDraft({...draft,id:e.target.value})} placeholder="ex: pneumatic_failure"/></label><label className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm font-semibold"><input type="checkbox" checked={draft.isActive} onChange={(e)=>setDraft({...draft,isActive:e.target.checked})}/>Ativo</label><div className="flex flex-wrap gap-2 pt-2"><BigButton tone="primary" size="md" onClick={handleSave}>Salvar classificação</BigButton><BigButton tone="neutral" size="md" onClick={handleCancel}>Cancelar</BigButton><BigButton tone="danger" size="md" onClick={handleToggleActive} disabled={!selectedId}>{draft.isActive?"Inativar":"Reativar"}</BigButton></div></CardSection></div></div>;
}
