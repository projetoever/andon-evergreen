import { useState } from "react";
import { useAndon } from "@/context/AndonProvider";
import { StatusSummaryBar } from "@/components/layout/StatusSummaryBar";
import { MachineGrid } from "@/components/machines/MachineGrid";
import { BigButton } from "@/components/common/BigButton";
import { unlockAudio } from "@/services/soundService";
import { Volume2, Settings } from "lucide-react";
import { AdminSettingsModal } from "@/components/settings/AdminSettingsModal";
import { AdminLoginModal } from "@/components/settings/AdminLoginModal";
import { isAdminAuthenticated } from "@/services/adminAuthService";
import { toast } from "sonner";

export function DashboardPage() {
  const {
    machines,
    audioUnlocked,
    setAudioUnlocked,
  } = useAndon();
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);

  function handleUnlock() {
    unlockAudio();
    setAudioUnlocked(true);
    toast.success("Painel ativo — sons habilitados");
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col gap-1.5 overflow-hidden p-2 md:p-3">
      {!audioUnlocked && (
        <div className="flex shrink-0 flex-col items-center justify-between gap-2 rounded-xl border-2 border-warning bg-warning/10 px-3 py-1.5 text-warning sm:flex-row">
          <div className="flex items-center gap-3">
            <Volume2 className="h-6 w-6" />
            <span className="text-base font-bold">
              Toque em "Iniciar Painel" para liberar os sons dos chamados.
            </span>
          </div>
          <BigButton tone="primary" size="md" onClick={handleUnlock}>
            INICIAR PAINEL / ATIVAR SONS
          </BigButton>
        </div>
      )}

      <div className="shrink-0">
        <StatusSummaryBar />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1">
        <h2 className="text-lg font-bold uppercase tracking-wide text-foreground md:text-xl">Máquinas</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Configurar sons do ANDON"
            aria-label="Configurar sons do ANDON"
            onClick={() => (isAdminAuthenticated() ? setAdminSettingsOpen(true) : setAdminLoginOpen(true))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AdminLoginModal open={adminLoginOpen} onOpenChange={setAdminLoginOpen} onSuccess={() => setAdminSettingsOpen(true)} />
      <AdminSettingsModal open={adminSettingsOpen} onOpenChange={setAdminSettingsOpen} />

      <MachineGrid
        className="min-h-0 flex-1"
        machines={machines}
      />
    </div>
  );
}
