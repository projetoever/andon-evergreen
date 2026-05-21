import { useEffect, useMemo, useState } from "react";
import { BigButton } from "@/components/common/BigButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CALL_TYPE_OPTIONS } from "@/data/callTypes";
import { useAndon } from "@/context/AndonProvider";
import { DEFAULT_SOUND_MACHINE_ID, type SoundMachineId } from "@/types/sound";
import { getSoundConfig, listSoundConfigs, removeSoundConfig, saveSoundConfig } from "@/services/soundStorageService";
import { testAndonSound } from "@/services/soundService";
import { toast } from "sonner";

interface SoundSettingsModalProps { open: boolean; onOpenChange: (open: boolean) => void }

export function SoundSettingsModal({ open, onOpenChange }: SoundSettingsModalProps) {
  const { machines } = useAndon();
  const [machineId, setMachineId] = useState<SoundMachineId>(DEFAULT_SOUND_MACHINE_ID);
  const [subtype, setSubtype] = useState(CALL_TYPE_OPTIONS[0].id);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [configs, setConfigs] = useState<any[]>([]);
  const [currentConfig, setCurrentConfig] = useState<any | null>(null);

  const acceptedTypes = useMemo(() => ["audio/mpeg", "audio/wav", "audio/ogg"], []);

  async function refresh() {
    const [list, config] = await Promise.all([listSoundConfigs(), getSoundConfig(machineId, subtype)]);
    setConfigs(list);
    setCurrentConfig(config);
  }

  useEffect(() => { if (open) void refresh(); }, [open, machineId, subtype]);

  async function handleSave() {
    if (!selectedFile) return toast.error("Nenhum som configurado para esta seleção.");
    if (!acceptedTypes.includes(selectedFile.type) && !/\.(mp3|wav|ogg)$/i.test(selectedFile.name)) {
      return toast.error("Formato inválido. Use .mp3, .wav ou .ogg.");
    }
    await saveSoundConfig(machineId, subtype, selectedFile);
    setSelectedFile(null);
    await refresh();
    toast.success("Som salvo com sucesso.");
  }

  async function handleRemove() {
    await removeSoundConfig(machineId, subtype);
    await refresh();
    toast.success("Som removido.");
  }

  async function handleTest() {
    const ok = await testAndonSound(machineId, subtype);
    if (!ok) toast.message("Nenhum som configurado para esta seleção.");
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
    <DialogHeader><DialogTitle>Configuração de Sons do ANDON</DialogTitle><DialogDescription>Configure um som específico por máquina e tipo de chamado.</DialogDescription></DialogHeader>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm font-bold">Máquina<select className="mt-1 w-full rounded border p-2" value={machineId} onChange={(e)=>setMachineId(e.target.value)}><option value="default">Padrão para todas</option>{machines.map((m)=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label className="text-sm font-bold">Tipo de chamado<select className="mt-1 w-full rounded border p-2" value={subtype} onChange={(e)=>setSubtype(e.target.value as any)}>{CALL_TYPE_OPTIONS.map((o)=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    </div>
    <div className="space-y-2 rounded border p-3"><div className="text-sm font-bold">Arquivo de áudio</div><input type="file" accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg" onChange={(e)=>setSelectedFile(e.target.files?.[0] ?? null)} />
      {selectedFile && <p className="text-xs">{selectedFile.name} · {(selectedFile.size/1024).toFixed(1)} KB</p>}
      {currentConfig && <p className="text-xs text-muted-foreground">Atual: {currentConfig.fileName} · {(currentConfig.sizeBytes/1024).toFixed(1)} KB · {new Date(currentConfig.updatedAt).toLocaleString("pt-BR")}</p>}
      {!currentConfig && !selectedFile && <p className="text-xs text-muted-foreground">Nenhum som configurado</p>}
    </div>
    <div className="flex flex-wrap gap-2"><BigButton tone="info" size="md" onClick={()=>void handleTest()}>Testar som</BigButton><BigButton tone="danger" size="md" onClick={()=>void handleRemove()}>Remover som</BigButton><BigButton tone="primary" size="md" onClick={()=>void handleSave()}>Salvar</BigButton><BigButton tone="neutral" size="md" onClick={()=>onOpenChange(false)}>Cancelar</BigButton></div>
    <div className="space-y-1"><div className="text-sm font-bold">Sons configurados</div>{configs.slice(0,10).map((cfg)=><div className="text-xs" key={cfg.id}>{cfg.machineId === "default" ? "Padrão" : `Máquina ${cfg.machineId}`} · {CALL_TYPE_OPTIONS.find((o)=>o.id===cfg.subtype)?.label ?? cfg.subtype} · {cfg.fileName}</div>)}</div>
  </DialogContent></Dialog>;
}
