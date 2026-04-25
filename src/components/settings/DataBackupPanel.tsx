import { useRef, useState } from "react";
import { useAndon } from "@/context/AndonProvider";
import { BigButton } from "@/components/common/BigButton";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  exportBackupToJson,
  exportHistoryToCsv,
  importBackupFromJson,
} from "@/services/exportService";
import { APP_VERSION } from "@/constants/appConstants";
import { Download, Upload, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function DataBackupPanel() {
  const { machines, calls, settings, soundConfigs, importBackup, resetAllLocalData } =
    useAndon();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmImport, setConfirmImport] = useState<File | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const finishedCalls = calls.filter((c) => c.status === "finished");

  function handleExportCsv() {
    if (finishedCalls.length === 0) {
      toast.warning("Não há chamados finalizados para exportar");
      return;
    }
    exportHistoryToCsv(finishedCalls);
    toast.success("CSV exportado");
  }

  function handleExportJson() {
    exportBackupToJson({
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      machines,
      calls,
      settings,
      soundConfigs,
    });
    toast.success("Backup JSON exportado");
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setConfirmImport(file);
    e.target.value = "";
  }

  async function applyImport() {
    if (!confirmImport) return;
    try {
      const data = await importBackupFromJson(confirmImport);
      importBackup(data);
      toast.success("Backup importado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao importar backup");
    } finally {
      setConfirmImport(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 text-xl font-bold uppercase tracking-wider text-foreground">
        Backup de dados
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BigButton tone="success" size="md" onClick={handleExportCsv}>
          <FileSpreadsheet className="h-5 w-5" /> Exportar CSV
        </BigButton>
        <BigButton tone="info" size="md" onClick={handleExportJson}>
          <Download className="h-5 w-5" /> Exportar Backup JSON
        </BigButton>
        <BigButton tone="warning" size="md" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-5 w-5" /> Importar Backup JSON
        </BigButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileChosen}
        />
        <BigButton tone="danger" size="md" onClick={() => setConfirmReset(true)}>
          <Trash2 className="h-5 w-5" /> Limpar dados locais
        </BigButton>
      </div>
      <ConfirmDialog
        open={!!confirmImport}
        onOpenChange={(o) => !o && setConfirmImport(null)}
        title="Importar backup?"
        description="Os dados atuais serão substituídos pelos dados do arquivo selecionado."
        confirmLabel="Sim, importar"
        onConfirm={applyImport}
      />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Limpar todos os dados locais?"
        description="Esta ação apaga máquinas, chamados, histórico e configurações deste navegador."
        confirmLabel="Sim, limpar"
        destructive
        onConfirm={() => {
          resetAllLocalData();
          setConfirmReset(false);
          toast.success("Dados locais limpos");
        }}
      />
    </div>
  );
}
