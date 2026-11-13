import { useEffect, useState } from "react";
import { ui } from "@/i18n/translate";
import { getSystemSettings } from "@/services/systemSettingsService";
import type { SystemSettings } from "@/types/systemSettings";
import type { SettingsTab } from "@/types/settings";

type CapabilityStatus = "enabled" | "disabled" | "partial" | "unverified";
export type CapabilityNotice = { status: CapabilityStatus; message: string };

/**
 * CFG-15: describe only capabilities explicitly reported by the backend.
 * Visibility of a tab or an enabled feature flag is NEVER an ACL grant.
 * No capability implies a successful write or production acceptance.
 */
export function centralTabCapabilityNotice(
  tab: SettingsTab,
  settings: SystemSettings,
): CapabilityNotice {
  switch (tab) {
    case "general":
      return settings.centralOperationalSettingsWriteEnabled === true
        ? { status: "enabled", message: "Gravação das configurações operacionais habilitada no servidor. Cada alteração ainda exige permissão e validação da API." }
        : { status: "disabled", message: "Gravação central de configurações operacionais desabilitada neste ambiente. A consulta permanece disponível." };
    case "appearance":
      return settings.andonVisualPaletteWriteEnabled === true
        ? { status: "enabled", message: "Gravação da paleta global habilitada no servidor, sujeita às permissões e à revisão atual. A prévia não altera alertas." }
        : { status: "partial", message: "A prévia de cores está disponível. Salvar a paleta global permanece desabilitado no servidor." };
    case "attendance":
      return settings.centralDeclaredAttendanceEnabled === true
        ? { status: "partial", message: "Seleção por nome habilitada no servidor como identidade declarada e auditável; PIN e RFID seguem suas próprias autorizações." }
        : { status: "partial", message: "Seleção por nome não habilitada no acesso central. PIN e RFID seguem suas próprias autorizações e devem ser validados separadamente." };
    case "callReasons":
      return settings.centralCallReasonsCatalogEnabled === true
        ? { status: "partial", message: "Catálogo de motivos habilitado no servidor. Edição, criação, vínculos e políticas de KPI exigem autorizações distintas; abertura hierárquica tem liberação independente." }
        : { status: "disabled", message: "Catálogo de motivos e subcategorias desabilitado neste ambiente. Nenhuma configuração de abertura ou KPI foi ativada." };
    case "sounds":
      return { status: "unverified", message: "Áudios personalizados são locais deste terminal. Esta consulta não confirma disponibilidade de gravação de arquivos nem distribuição de sons para outras workstations." };
    case "categories":
      return settings.centralCategorySettingsWriteEnabled === true
        ? { status: "partial", message: "Criação e edição centrais de setores habilitadas. Remoção de setores não é permitida pelo acesso central; inative quando necessário." }
        : { status: "disabled", message: "Criação e edição centrais de setores desabilitadas. A listagem permanece disponível; a remoção não é autorizada no acesso central." };
    case "shifts":
      return settings.centralShiftUpdateEnabled === true
        ? { status: "partial", message: "Edição central de turnos habilitada. Cadastro de novos turnos não está disponível e o filtro de turno usa outra configuração." }
        : { status: "disabled", message: "Edição central de turnos desabilitada. Consulta e filtro de turno possuem regras separadas; não implica falha no cadastro." };
    case "classifications":
      return settings.centralClassificationWriteEnabled === true
        ? { status: "partial", message: "Criação e edição centrais de classificações habilitadas. Cada operação ainda depende de sessão, autorização e auditoria." }
        : { status: "disabled", message: "Criação e edição centrais de classificações desabilitadas; a listagem permanece disponível." };
    case "assetCatalogs":
      return settings.centralAssetTypeCatalogWriteEnabled === true
        ? { status: "partial", message: "Cadastro e edição de tipos de conjuntos e subconjuntos habilitados. Remoção e alterações em conjuntos de máquinas têm controles separados." }
        : { status: "disabled", message: "Cadastro e edição centrais de tipos de conjuntos e subconjuntos desabilitados; a listagem permanece disponível." };
    case "technicians": {
      const create = settings.centralTechnicianCreateEnabled === true;
      const update = settings.centralTechnicianUpdateEnabled === true;
      if (create && update)
        return { status: "partial", message: "Cadastro e edição centrais de mantenedores habilitados. Credenciais e atendimento possuem proteções independentes." };
      if (create)
        return { status: "partial", message: "Cadastro central de mantenedores habilitado, mas a edição central permanece desabilitada." };
      if (update)
        return { status: "partial", message: "Edição central de mantenedores habilitada, mas novos cadastros centrais permanecem desabilitados." };
      return { status: "disabled", message: "Cadastro e edição centrais de mantenedores desabilitados; a listagem permanece disponível." };
    }
    case "machines": {
      const create = settings.centralMachineCreateEnabled === true;
      const update = settings.centralMachineSettingsWriteEnabled === true;
      if (create && update)
        return { status: "partial", message: "Cadastro e edição de metadados de máquinas habilitados. Estado operacional, produção e controle físico permanecem protegidos por rotas próprias." };
      if (create)
        return { status: "partial", message: "Cadastro central de máquinas habilitado; edição de metadados e controle operacional permanecem separados." };
      if (update)
        return { status: "partial", message: "Edição central de metadados de máquinas habilitada; cadastro de máquinas permanece desabilitado." };
      return { status: "disabled", message: "Cadastro e edição centrais de máquinas desabilitados; consulta do inventário permanece disponível." };
    }
    default:
      return {
        status: "unverified",
        message: "Esta aba está visível, mas não há indicador central de disponibilidade para todas as suas operações. Cada cadastro continua sujeito às permissões, validações e recursos habilitados na API.",
      };
  }
}

export function CentralSettingsCapabilityNotice({
  tab, open,
}: { tab: SettingsTab; open: boolean }) {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setSettings(null);
    setLoadFailed(false);
    void getSystemSettings().then(value => {
      if (current) setSettings(value);
    }).catch(() => {
      if (current) setLoadFailed(true);
    });
    return () => { current = false; };
  }, [open]);

  if (!open) return null;
  if (loadFailed) {
    return (
      <p role="status" className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        {ui("Não foi possível verificar a disponibilidade das funções desta aba. Isso não significa permissão concedida; consulte o aviso da própria operação.")}
      </p>
    );
  }
  if (!settings) {
    return <p role="status" className="text-xs text-muted-foreground">{ui("Verificando disponibilidade das configurações...")}</p>;
  }
  const notice = centralTabCapabilityNotice(tab, settings);
  return (
    <div role="status" data-capability-state={notice.status}
      className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
      <p className="font-semibold text-foreground">
        {ui(notice.status === "enabled" ? "Recurso habilitado no servidor" :
          notice.status === "disabled" ? "Recurso desabilitado" :
            notice.status === "partial" ? "Disponibilidade parcial" : "Disponibilidade não verificada")}
      </p>
      <p className="mt-1">{ui(notice.message)}</p>
    </div>
  );
}
