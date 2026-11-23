import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PENTE1: seis KPIs mostram ajuda estruturada via popover acessível", async () => {
  const [card, overview] = await Promise.all([
    readFile(new URL("../src/components/bi/BiKpiCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiOverviewWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(card, /<PopoverTrigger asChild>/);
  assert.match(card, /<PopoverContent/);
  assert.match(card, /aria-label=\{ui\("Explicação do indicador: \{0\}"/);
  assert.match(card, /collisionPadding=\{12\}/);
  assert.match(card, /focus-visible:ring-2/);
  for (const field of ["measure", "formula", "interpretation", "whenUnavailable"])
    assert.match(card, new RegExp("help\\." + field));
  for (const name of ["availability", "mtbf", "mtta", "mttr", "downtime", "returnRate"])
    assert.match(overview, new RegExp("help=\\{help\\." + name + "\\}"));
  assert.match(overview, /motivo corretivo elegível/);
  assert.match(overview, /explainMissingMtbf\(scheduled\)/);
  assert.match(overview, /explainMissingMttr\(scheduled\)/);
});

test("PENTE1: central de qualidade esclarece natureza e contagem dos alertas sem mutações", async () => {
  const [quality, route] = await Promise.all([
    readFile(new URL("../src/components/bi/BiDataHealthPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/analyticsDataQuality.ts", import.meta.url), "utf8"),
  ]);
  assert.match(quality, /registros a conferir, não falhas confirmadas/);
  assert.match(quality, /não registros únicos/);
  assert.match(quality, /Snapshot atual/);
  assert.match(quality, /Período filtrado/);
  assert.match(quality, /onMachineSelect/);
  assert.doesNotMatch(route, /prisma\.[\s\S]*?\.(?:update|delete|create)\(/);
});
