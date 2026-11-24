import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { AlertTriangle, ClipboardList } from "lucide-react";
import type { BiSampleDiagnostics } from "@/types/analytics";

const GATE_LABELS: Record<BiSampleDiagnostics["cases"][number]["gate"], string> = {
  awaiting_finalization: "Em atendimento: finalize para gerar amostra de retorno",
  finished_outside_period: "Finalização fora do período escolhido",
  non_corrective_group: "Grupo não habilitado para manutenção corretiva",
  unassigned_diagnosis: "Diagnóstico sem responsabilidade confirmada",
  non_maintenance_diagnosis: "Diagnóstico atribuído a outra área",
  no_linked_physical_stop: "Não há parada física vinculada a este chamado",
  candidate_needs_causal_episode: "Candidato: conferir parada física, sobreposições e programação",
};

export function BiSampleDiagnosticsPanel({
  data, noKpiSample,
}: {
  data: BiSampleDiagnostics | null | undefined;
  noKpiSample: boolean;
}) {
  useInterfaceLanguage();
  if (!data) return null;
  const c = data.counters;
  const warning = noKpiSample && (c.finishedInPeriod > 0 || c.attendedInPeriod > 0);
  return (
    <details
      open={warning}
      className="min-w-0 shrink-0 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs"
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 font-bold text-foreground">
        {warning ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" /> : <ClipboardList className="h-4 w-4 shrink-0 text-primary" />}
        <span>{ui("Por que os KPIs estão sem amostra?")}</span>
        <span className="ml-auto font-normal text-muted-foreground">
          {ui("{0} atendido(s) · {1} finalizado(s) · {2} manutenção corretiva confirmada", {
            0: c.attendedInPeriod, 1: c.finishedInPeriod, 2: c.correctiveFinishedMaintenance,
          })}
        </span>
      </summary>
      <div className="space-y-3 border-t border-border/50 px-3 py-3">
        <p className="text-[11px] leading-5 text-muted-foreground">
          {ui("Registro, atendimento e amostra válida são etapas diferentes. Abaixo estão os filtros aplicados ao período e à máquina selecionados. Nenhum dado é alterado.")}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {([
            [ui("Atendidos"), c.attendedInPeriod],
            [ui("Finalizados"), c.finishedInPeriod],
            [ui("Finalizados corretivos"), c.correctiveFinished],
            [ui("Responsabilidade pendente"), c.correctiveFinishedPendingResponsibility],
            [ui("MTTR: paradas corretivas"), c.closedMaintenancePhysicalEpisodes],
            [ui("MTBF: falhas programadas"), c.scheduledMaintenanceFailureStarts],
          ] as const).map(([label,count]) => (
            <div key={label} className="rounded-lg border border-border bg-card/70 p-2">
              <div className="font-black tabular-nums text-lg">{count}</div>
              <div className="text-[10px] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {ui("Também existem {0} chamado(s) finalizado(s) fora da política corretiva, {1} parada(s) encerrada(s) com responsabilidade pendente e {2} episódio(s) pendente(s) na produção programada.", {
            0: c.nonCorrectiveFinished, 1: c.closedPendingPhysicalEpisodes, 2: c.scheduledPendingEpisodes,
          })}
        </p>
        <div className="max-h-48 overflow-auto rounded-lg border border-border bg-background/30">
          <table className="w-full min-w-[640px] text-left text-[11px]">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>
                <th className="px-2 py-2">{ui("Chamado")}</th>
                <th className="px-2 py-2">{ui("Máquina")}</th>
                <th className="px-2 py-2">{ui("Grupo")}</th>
                <th className="px-2 py-2">{ui("Diagnóstico")}</th>
                <th className="px-2 py-2">{ui("Situação de elegibilidade")}</th>
              </tr>
            </thead>
            <tbody>
              {data.cases.map(item => (
                <tr key={item.machineId + ":" + item.callIdSuffix} className="border-t border-border/50">
                  <td className="px-2 py-2 font-mono">{item.callIdSuffix}</td>
                  <td className="px-2 py-2">{item.machineId}</td>
                  <td className="px-2 py-2">{item.groupName ?? ui("Botão direto/legado")}</td>
                  <td className="px-2 py-2">
                    {item.failureClassification ?? ui("Não classificado")}
                    <span className="block text-muted-foreground">{item.failureResponsibility ?? ui("Pendente")}</span>
                  </td>
                  <td className="px-2 py-2">{ui(GATE_LABELS[item.gate])}</td>
                </tr>
              ))}
              {data.cases.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  {ui("Nenhum chamado elegível foi encontrado nesta janela e nos filtros aplicados.")}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {ui("Chamados candidatos não garantem participação em MTTR/MTBF: a coorte física considera atribuição, sobreposições, restauração e programação. Paradas transferidas podem constar em outro chamado.")}
        </p>
      </div>
    </details>
  );
}
