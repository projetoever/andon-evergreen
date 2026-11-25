import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { ui } from "@/i18n/translate";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AnalyticsProductionMetrics } from "@/types/analytics";
export function BiProductionCoverageDialog({data}:{data:AnalyticsProductionMetrics}) {
  const [open,setOpen]=useState(false);
  const rows=[...(data.machineCoverage??[])].sort((a,b)=>Number(a.status!=="incomplete")-Number(b.status!=="incomplete")||a.machineId.localeCompare(b.machineId));
  const labels={complete:"Histórico completo com produção programada",complete_no_scheduled:"Histórico completo, sem produção programada",incomplete:"Histórico incompleto",outside_window:"Fora da janela"} as const;
  const reasons={verified_scheduled:"Minutos programados verificados",verified_not_scheduled:"Modo não programado verificado",no_history:"Sem registros de programação",history_gap:"Lacuna ou modo desconhecido na janela",not_in_window:"Sem tempo observado"} as const;
  return <>
    <button type="button" onClick={()=>setOpen(true)} aria-label={ui("Detalhar cobertura histórica")}
      className="ml-2 inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-semibold hover:bg-muted">
      <CircleHelp className="h-3 w-3"/>{ui("Detalhar cobertura")}
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[92dvh] w-[min(95vw,920px)] max-w-none flex-col gap-3 overflow-hidden p-4 sm:p-5">
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle>{ui("Cobertura histórica por máquina")}</DialogTitle>
          <DialogDescription>{ui("Histórico completo não significa que a máquina está produzindo agora.")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded border p-2">{data.populationCount} {ui("na população")}</div>
          <div className="rounded border p-2">{data.coveredMachineCount} {ui("históricos completos")}</div>
          <div className="rounded border p-2">{data.uncoveredMachineCount} {ui("históricos incompletos")}</div>
        </div>
        <p className="text-xs text-muted-foreground">{ui("Máquina atualmente produzindo pode ter lacunas no período. Máquina atualmente fora da produção pode ter histórico completo. Não inventar horas programadas.")}</p>
        <div className="min-h-0 overflow-auto rounded border border-border">
          <table className="w-full min-w-[530px] text-left text-xs">
            <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-2">{ui("Máquina")}</th><th className="p-2">{ui("Estado")}</th><th className="p-2">{ui("Motivo")}</th></tr></thead>
            <tbody>{rows.map(r=><tr key={r.machineId} className="border-t border-border/60">
              <td className="p-2 font-bold">{r.machineId}</td><td className="p-2">{ui(labels[r.status])}</td><td className="p-2">{ui(reasons[r.reason])}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">{ui("Histórico completo sem minutos programados conta na cobertura, mas não no tempo de disponibilidade.")}</p>
      </DialogContent>
    </Dialog>
  </>;
}
