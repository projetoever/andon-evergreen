import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BigButton } from "@/components/common/BigButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAndon } from "@/context/AndonProvider";
import { CALL_TYPE_OPTIONS } from "@/data/callTypes";
import { logoutAdmin } from "@/services/adminAuthService";
import { getCategoryConfigs, saveCategoryConfigs } from "@/services/categoryConfigService";
import { testAndonSound } from "@/services/soundService";
import { getSoundConfig, listSoundConfigs, removeSoundConfig, saveSoundConfig } from "@/services/soundStorageService";
import { DEFAULT_SHIFTS, getShiftConfigs, saveShiftConfigs } from "@/services/shiftConfigService";
import { getTechnicianConfigs, saveTechnicianConfigs } from "@/services/technicianConfigService";
import type { CallSubtype } from "@/types/andon";
import type { AndonCategoryConfig, SettingsTab, ShiftConfig, TechnicianConfig } from "@/types/settings";
import { DEFAULT_SOUND_MACHINE_ID, type SoundMachineId } from "@/types/sound";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "sounds", label: "Sons do ANDON" },
  { id: "technicians", label: "Manutentores" },
  { id: "categories", label: "Categorias" },
  { id: "shifts", label: "Turnos" },
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
              className={cn(
                "min-h-10 rounded-md border px-4 text-sm font-bold",
                tab === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "sounds" && <SoundsTab />}
        {tab === "technicians" && <TechniciansTab />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "shifts" && <ShiftsTab />}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <BigButton tone="danger" size="md" onClick={() => { logoutAdmin(); onOpenChange(false); }}>
            Sair do modo admin
          </BigButton>
          <BigButton tone="neutral" size="md" onClick={() => onOpenChange(false)}>
            Fechar
          </BigButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SoundsTab() {
  const { machines } = useAndon();
  const [items, setItems] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [machineId, setMachineId] = useState<SoundMachineId>(DEFAULT_SOUND_MACHINE_ID);
  const [subtype, setSubtype] = useState(CALL_TYPE_OPTIONS[0].id);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentConfig, setCurrentConfig] = useState<any | null>(null);

  async function refresh() {
    const list = await listSoundConfigs();
    setItems(list);
    const config = await getSoundConfig(machineId, subtype);
    setCurrentConfig(config);
  }

  useEffect(() => {
    void refresh();
  }, [machineId, subtype]);

  function handleAdd() {
    setSelectedId(null);
    setMachineId(DEFAULT_SOUND_MACHINE_ID);
    setSubtype(CALL_TYPE_OPTIONS[0].id);
    setSelectedFile(null);
    setCurrentConfig(null);
  }

  async function handleSave() {
    if (!selectedFile) return toast.error("Selecione um arquivo de áudio para salvar.");
    if (!/\.(mp3|wav|ogg)$/i.test(selectedFile.name)) return toast.error("Formato inválido. Use .mp3, .wav ou .ogg.");
    await saveSoundConfig(machineId, subtype, selectedFile);
    toast.success("Som salvo com sucesso.");
    setSelectedFile(null);
    await refresh();
  }

  async function handleRemove() {
    await removeSoundConfig(machineId, subtype);
    toast.success("Som removido.");
    handleAdd();
    await refresh();
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]">
      <CardSection title="Configurações salvas">
        <BigButton tone="neutral" size="md" onClick={handleAdd}>Adicionar configuração de som</BigButton>
        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>}
          {items.map((cfg) => (
            <button
              key={cfg.id}
              type="button"
              onClick={async () => {
                setSelectedId(cfg.id);
                setMachineId(cfg.machineId);
                setSubtype(cfg.subtype);
                setSelectedFile(null);
                setCurrentConfig(await getSoundConfig(cfg.machineId, cfg.subtype));
              }}
              className={cn("w-full rounded-lg border p-3 text-left", selectedId === cfg.id ? "border-primary bg-primary/10" : "border-border")}
            >
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
          <BigButton tone="primary" size="md" onClick={() => void handleSave()}>Salvar som</BigButton>
          <BigButton tone="info" size="md" onClick={() => void testAndonSound(machineId, subtype)}>Testar som</BigButton>
          <BigButton tone="neutral" size="md" onClick={handleAdd}>Cancelar</BigButton>
          <BigButton tone="danger" size="md" onClick={() => void handleRemove()}>Remover som</BigButton>
        </div>
      </CardSection>
    </div>
  );
}

function TechniciansTab() {
  const [items, setItems] = useState<TechnicianConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const emptyDraft: TechnicianConfig = { id: "", name: "", area: "electrical", shifts: [], active: true };
  const [draft, setDraft] = useState<TechnicianConfig>(emptyDraft);

  useEffect(() => setItems(getTechnicianConfigs()), []);

  const shiftNameById = useMemo(() => Object.fromEntries(DEFAULT_SHIFTS.map((s) => [s.id, s.name])), []);

  function handleAdd() { setSelectedId(null); setDraft(emptyDraft); }

  function handleSelect(item: TechnicianConfig) { setSelectedId(item.id); setDraft({ ...item }); }

  function persist(next: TechnicianConfig[]) { setItems(next); saveTechnicianConfigs(next); }

  function handleSave() {
    const trimmed = draft.name.trim();
    if (!trimmed) return toast.error("Informe o nome do manutentor.");
    const duplicate = items.some((t) => t.id !== draft.id && t.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) return toast.error("Já existe manutentor com este nome.");
    const id = draft.id || `tech-${Date.now()}`;
    const nextItem = { ...draft, id, name: trimmed };
    const next = [...items.filter((t) => t.id !== id), nextItem].sort((a, b) => a.name.localeCompare(b.name));
    persist(next);
    setSelectedId(id);
    setDraft(nextItem);
    toast.success("Manutentor salvo.");
  }

  function handleToggleActive() {
    if (!draft.id) return;
    const next = items.map((t) => (t.id === draft.id ? { ...t, active: !t.active } : t));
    persist(next);
    setDraft((prev) => ({ ...prev, active: !prev.active }));
  }

  return <div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]">
    <CardSection title="Manutentores cadastrados"><BigButton tone="neutral" size="md" onClick={handleAdd}>Adicionar manutentor</BigButton><div className="space-y-2">{items.length===0&&<p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>}{items.map((item)=><button key={item.id} type="button" onClick={()=>handleSelect(item)} className={cn("w-full rounded-lg border p-3 text-left",selectedId===item.id?"border-primary bg-primary/10":"border-border")}><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-muted-foreground">{areaOptions.find((a)=>a.id===item.area)?.label} · {(item.shifts.length?item.shifts.map((shiftId)=>shiftNameById[shiftId]).join(", "):"Sem turnos")}</p><p className="text-xs text-muted-foreground">{item.active?"Ativo":"Inativo"}</p></button>)}</div></CardSection>
    <CardSection title={selectedId?"Editar manutentor":"Novo manutentor"}><label className="text-sm font-semibold">Nome do manutentor<input className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})} /></label><label className="text-sm font-semibold">Área técnica<select className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={draft.area} onChange={(e)=>setDraft({...draft,area:e.target.value as CallSubtype})}>{areaOptions.map((area)=><option key={area.id} value={area.id}>{area.label}</option>)}</select></label><div className="space-y-2"><p className="text-sm font-semibold">Turnos</p><div className="grid grid-cols-2 gap-2">{DEFAULT_SHIFTS.map((shift)=><label key={shift.id} className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm"><input type="checkbox" checked={draft.shifts.includes(shift.id)} onChange={()=>setDraft((prev)=>({ ...prev, shifts: prev.shifts.includes(shift.id) ? prev.shifts.filter((id) => id !== shift.id) : [...prev.shifts, shift.id]}))} />{shift.name}</label>)}</div></div><label className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm font-semibold"><input type="checkbox" checked={draft.active} onChange={(e)=>setDraft({...draft,active:e.target.checked})}/>Ativo</label><div className="flex flex-wrap gap-2 pt-2"><BigButton tone="primary" size="md" onClick={handleSave}>Salvar manutentor</BigButton><BigButton tone="neutral" size="md" onClick={handleAdd}>Cancelar</BigButton><BigButton tone="danger" size="md" onClick={handleToggleActive} disabled={!draft.id}>{draft.active?"Inativar":"Reativar"}</BigButton></div></CardSection>
  </div>;
}

function CategoriesTab() {
  const [items, setItems] = useState<AndonCategoryConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string>("electrical");
  const [draft, setDraft] = useState<AndonCategoryConfig | null>(null);
  useEffect(() => {
    const list = getCategoryConfigs();
    setItems(list);
    const first = list.find((x) => x.id === "electrical") ?? list[0];
    setSelectedId(first.id);
    setDraft({ ...first });
  }, []);
  function persist(next: AndonCategoryConfig[]) { setItems(next); saveCategoryConfigs(next); }
  function handleSelect(item: AndonCategoryConfig) { setSelectedId(item.id); setDraft({ ...item }); }
  function handleSave() { if (!draft) return; const next = items.map((x) => x.id === draft.id ? draft : x); persist(next); toast.success("Categoria salva."); }
  function handleCancel() { const original = items.find((x) => x.id === selectedId); if (original) setDraft({ ...original }); }

  if (!draft) return null;
  return <div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]"><CardSection title="Categorias"><div className="space-y-2">{items.map((item)=><button key={item.id} type="button" onClick={()=>handleSelect(item)} className={cn("w-full rounded-lg border p-3 text-left",selectedId===item.id?"border-primary bg-primary/10":"border-border")}><p className="text-sm font-bold">{item.displayName}</p><p className="text-xs text-muted-foreground">ID: {item.id} · {item.active?"Ativo":"Inativo"}</p></button>)}</div></CardSection><CardSection title="Editar categoria"><label className="text-sm font-semibold">ID interno<input readOnly value={draft.id} className="mt-1 h-10 w-full rounded-md border bg-muted px-2 text-muted-foreground" /></label><label className="text-sm font-semibold">Nome exibido<input value={draft.displayName} onChange={(e)=>setDraft({...draft,displayName:e.target.value})} className="mt-1 h-10 w-full rounded-md border bg-background px-2" /></label><label className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm font-semibold"><input type="checkbox" checked={draft.active} onChange={(e)=>setDraft({...draft,active:e.target.checked})}/>Ativo</label><div className="flex flex-wrap gap-2 pt-2"><BigButton tone="primary" size="md" onClick={handleSave}>Salvar categoria</BigButton><BigButton tone="neutral" size="md" onClick={handleCancel}>Cancelar</BigButton><BigButton tone="danger" size="md" onClick={()=>setDraft((prev)=>prev?{...prev,active:!prev.active}:prev)}>{draft.active?"Inativar":"Ativar"}</BigButton></div></CardSection></div>;
}

function ShiftsTab() {
  const [items, setItems] = useState<ShiftConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string>("morning");
  const [draft, setDraft] = useState<ShiftConfig | null>(null);
  useEffect(() => {
    const list = getShiftConfigs();
    setItems(list);
    const first = list.find((x) => x.id === "morning") ?? list[0];
    setSelectedId(first.id);
    setDraft({ ...first });
  }, []);
  function persist(next: ShiftConfig[]) { setItems(next); saveShiftConfigs(next); }
  function handleSelect(item: ShiftConfig) { setSelectedId(item.id); setDraft({ ...item }); }
  function handleSave() {
    if (!draft) return;
    if (!draft.startTime || !draft.endTime) return toast.error("Informe horário inicial e final.");
    const normalized = { ...draft, crossesMidnight: draft.startTime > draft.endTime };
    const next = items.map((x) => x.id === draft.id ? normalized : x);
    persist(next);
    setDraft(normalized);
    toast.success("Turno salvo.");
  }
  function handleCancel() { const original = items.find((x) => x.id === selectedId); if (original) setDraft({ ...original }); }

  if (!draft) return null;
  return <div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]"><CardSection title="Turnos"><div className="space-y-2">{items.map((item)=><button key={item.id} type="button" onClick={()=>handleSelect(item)} className={cn("w-full rounded-lg border p-3 text-left",selectedId===item.id?"border-primary bg-primary/10":"border-border")}><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-muted-foreground">{item.startTime} às {item.endTime} · {item.active?"Ativo":"Inativo"}</p><p className="text-xs text-muted-foreground">Cruza meia-noite: {item.crossesMidnight?"Sim":"Não"}</p></button>)}</div></CardSection><CardSection title="Editar turno"><label className="text-sm font-semibold">Nome do turno<input value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})} className="mt-1 h-10 w-full rounded-md border bg-background px-2" /></label><div className="grid gap-3 md:grid-cols-2"><label className="text-sm font-semibold">Horário início<input type="time" value={draft.startTime} onChange={(e)=>setDraft({...draft,startTime:e.target.value,crossesMidnight:e.target.value>draft.endTime})} className="mt-1 h-10 w-full rounded-md border bg-background px-2" /></label><label className="text-sm font-semibold">Horário fim<input type="time" value={draft.endTime} onChange={(e)=>setDraft({...draft,endTime:e.target.value,crossesMidnight:draft.startTime>e.target.value})} className="mt-1 h-10 w-full rounded-md border bg-background px-2" /></label></div><label className="flex h-10 items-center gap-2 rounded-md border border-border px-2 text-sm font-semibold"><input type="checkbox" checked={draft.active} onChange={(e)=>setDraft({...draft,active:e.target.checked})}/>Ativo</label><p className="text-sm text-muted-foreground">Cruza meia-noite: <span className="font-bold">{draft.crossesMidnight?"Sim":"Não"}</span></p><div className="flex flex-wrap gap-2 pt-2"><BigButton tone="primary" size="md" onClick={handleSave}>Salvar turno</BigButton><BigButton tone="neutral" size="md" onClick={handleCancel}>Cancelar</BigButton><BigButton tone="danger" size="md" onClick={()=>setDraft((prev)=>prev?{...prev,active:!prev.active}:prev)}>{draft.active?"Inativar":"Ativar"}</BigButton></div></CardSection></div>;
}
