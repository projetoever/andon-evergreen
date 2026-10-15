import { getInterfaceLocale, ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useMemo, useState } from "react";
import { BigButton } from "@/components/common/BigButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CALL_TYPE_OPTIONS } from "@/data/callTypes";
import { useAndon } from "@/context/AndonProvider";
import { DEFAULT_SOUND_MACHINE_ID, type SoundMachineId } from "@/types/sound";
import {
  getSoundConfig,
  listSoundConfigs,
  removeSoundConfig,
  saveSoundConfig,
} from "@/services/soundStorageService";
import { testAndonSound } from "@/services/soundService";
import { toast } from "@/i18n/toast";

interface SoundSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const selectClassName =
  "mt-1 w-full rounded-md border border-slate-600 bg-slate-950 p-2 text-slate-100 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500";
const optionClassName = "bg-slate-950 text-white";

export function SoundSettingsModal({ open, onOpenChange }: SoundSettingsModalProps) {
  useInterfaceLanguage();
  const { machines } = useAndon();
  const [machineId, setMachineId] = useState<SoundMachineId>(DEFAULT_SOUND_MACHINE_ID);
  const [subtype, setSubtype] = useState(CALL_TYPE_OPTIONS[0].id);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [configs, setConfigs] = useState<any[]>([]);
  const [currentConfig, setCurrentConfig] = useState<any | null>(null);

  const acceptedTypes = useMemo(() => ["audio/mpeg", "audio/wav", "audio/ogg"], []);

  async function refresh() {
    const [list, config] = await Promise.all([
      listSoundConfigs(),
      getSoundConfig(machineId, subtype),
    ]);
    setConfigs(list);
    setCurrentConfig(config);
  }

  useEffect(() => {
    if (open) void refresh();
  }, [open, machineId, subtype]);

  async function handleSave() {
    if (!selectedFile) return toast.error("Nenhum som configurado para esta seleção.");
    if (
      !acceptedTypes.includes(selectedFile.type) &&
      !/\.(mp3|wav|ogg)$/i.test(selectedFile.name)
    ) {
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

  async function handleRemove() {
    try {
      await removeSoundConfig(machineId, subtype);
      await refresh();
      toast.success("Som removido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o som.");
    }
  }

  async function handleTest() {
    try {
      const ok = await testAndonSound(machineId, subtype);
      if (!ok) toast.message("Nenhum som configurado para esta seleção.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reproduzir o som.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ui("Configuração de Sons do ANDON")}</DialogTitle>
          <DialogDescription>
            {ui("Configure um som específico por máquina e tipo de chamado.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-bold">
            {ui("Máquina")}
            <select
              className={selectClassName}
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
            >
              <option className={optionClassName} value="default">
                {ui("Padrão para todas")}
              </option>
              {machines.map((m) => (
                <option className={optionClassName} key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-bold">
            {ui("Tipo de chamado")}
            <select
              className={selectClassName}
              value={subtype}
              onChange={(e) => setSubtype(e.target.value as any)}
            >
              {CALL_TYPE_OPTIONS.map((o) => (
                <option className={optionClassName} key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-2 rounded border p-3">
          <div className="text-sm font-bold">{ui("Arquivo de áudio")}</div>
          <input
            type="file"
            accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
          {selectedFile && (
            <p className="text-xs">
              {selectedFile.name} · {(selectedFile.size / 1024).toFixed(1)}
              {ui(" KB")}
            </p>
          )}
          {currentConfig && (
            <p className="text-xs text-muted-foreground">
              {ui("Atual: ")}
              {currentConfig.fileName} · {(currentConfig.sizeBytes / 1024).toFixed(1)}
              {ui(" KB · ")}
              {new Date(currentConfig.updatedAt).toLocaleString(getInterfaceLocale())}
            </p>
          )}
          {!currentConfig && !selectedFile && (
            <p className="text-xs text-muted-foreground">{ui("Nenhum som configurado")}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <BigButton tone="info" size="md" onClick={() => void handleTest()}>
            {ui("Testar som")}
          </BigButton>
          <BigButton tone="danger" size="md" onClick={() => void handleRemove()}>
            {ui("Remover som")}
          </BigButton>
          <BigButton tone="primary" size="md" onClick={() => void handleSave()}>
            {ui("Salvar")}
          </BigButton>
          <BigButton tone="neutral" size="md" onClick={() => onOpenChange(false)}>
            {ui("Cancelar")}
          </BigButton>
        </div>

        <div className="space-y-1">
          <div className="text-sm font-bold">{ui("Sons configurados")}</div>
          {configs.slice(0, 10).map((cfg) => (
            <div className="text-xs" key={cfg.id}>
              {cfg.machineId === "default" ? ui("Padrão") : ui("Máquina {0}", { 0: cfg.machineId })}{" "}
              · {CALL_TYPE_OPTIONS.find((o) => o.id === cfg.subtype)?.label ?? cfg.subtype} ·{" "}
              {cfg.fileName}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
