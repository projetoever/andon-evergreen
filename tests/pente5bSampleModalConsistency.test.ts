import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("PENTE5B: desbloqueio, programação e recuperação reutilizam o mesmo modal", async () => {
  const [frame, unlock, schedule, recovery] = await Promise.all([
    read("../src/components/common/CredentialActionDialog.tsx"),
    read("../src/components/machines/CentralMachineScreenUnlockModal.tsx"),
    read("../src/components/machines/ProductionModeCredentialModal.tsx"),
    read("../src/components/security/CentralAdminRecoveryForm.tsx"),
  ]);
  for (const source of [unlock, schedule, recovery])
    assert.match(source, /<CredentialActionDialog /);
  assert.match(frame, /max-h-\[90dvh\]/);
  assert.match(frame, /sm:max-w-md/);
  assert.match(frame, /busy \? undefined : onOpenChange/);
  assert.match(frame, /DialogTitle/);
  assert.match(unlock, /\/workstations\/screen-unlock/);
  assert.match(unlock, /session\.principal\?\.purpose !== "normal"/);
  assert.match(schedule, /\/machines\/production-mode/);
  assert.match(schedule, /expectedProductionMode/);
  assert.match(schedule, /submittingRef/);
  assert.match(recovery, /\/admin-recover/);
  assert.match(recovery, /personalPasswordHint/);
  assert.match(recovery, /onRecovered\(\)/);
  assert.match(recovery, /setExpanded\(false\)/);
});

test("PENTE5B: indicadores com um caso comprovado são sinalizados sem disfarçar pendências", async () => {
  const [metrics, view, reasons, pdf, overview, types] = await Promise.all([
    read("../server/src/analytics/productionKpis.ts"),
    read("../src/components/bi/BiOverviewWorkspace.tsx"),
    read("../src/utils/biKpiAvailability.ts"),
    read("../src/services/andonBiPdfReport.ts"),
    read("../server/src/analytics/overview.ts"),
    read("../src/types/analytics.ts"),
  ]);
  assert.match(metrics, /plannedMtbfMinutes=episodes>0\?/);
  assert.match(metrics, /mtbfSampleStatus/);
  assert.match(metrics, /partial_pending_attribution/);
  assert.match(view, /explainPartialMtbf\(scheduled\)/);
  assert.match(pdf, /explainPartialMtbf\(overview\.production\)/);
  assert.match(reasons, /Estimativa parcial:/);
  assert.match(view, /Restauração física observada \(não é MTTR\)/);
  assert.match(overview, /pendingCorrectiveFinishedCalls/);
  assert.match(view, /corretivo\(s\) aguardam confirmação de responsabilidade/);
  assert.match(types, /"partial" \| "complete"/);
});
