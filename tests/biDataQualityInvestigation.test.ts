import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("BI-10 registra endpoint de investigação só leitura com paginação e exclusão de testes", async () => {
  const [entry, route] = await Promise.all([
    readFile(new URL("../server/src/routes/analytics.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/analyticsDataQuality.ts", import.meta.url), "utf8"),
  ]);
  assert.match(entry, /registerAnalyticsDataQualityRoutes\(app\)/);
  assert.match(route, /"\/api\/analytics\/data-quality-details"/);
  assert.match(route, /const PAGE_SIZE = 6/);
  assert.match(route, /"active-calls"/);
  assert.match(route, /"open-events"/);
  assert.match(route, /"active-sessions"/);
  assert.match(route, /"unclassified-calls"/);
  assert.match(route, /"unlinked-events"/);
  assert.match(route, /isSystemTest: false/);
  assert.match(route, /callId: null/);
  assert.match(route, /cannotAttribute/);
  assert.match(route, /take: PAGE_SIZE/);
  assert.match(route, /prisma\.andonCall\.count/);
  assert.match(route, /prisma\.failureEvent\.count/);
  assert.match(route, /prisma\.technicianSession\.count/);
  assert.doesNotMatch(route, /\.update\(|\.delete\(|\.create\(/);
});

test("BI-10 compara população de ativos sem mudar definição do MTBF executivo", async () => {
  const [route, page, panel, api] = await Promise.all([
    readFile(new URL("../server/src/routes/analytics.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiBadActorsPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/services/andonBiService.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /includeInactive = request\.query\.includeInactive === "true"/);
  assert.match(route, /includeInactive \? \{\} : \{ isActive: true \}/);
  assert.match(page, /Máquinas ativas/);
  assert.match(page, /Máquinas inativas/);
  assert.match(page, /Todas as máquinas/);
  assert.match(page, /BiReliabilityStrip overview=\{overview\}/);
  assert.match(panel, /population === "all"/);
  assert.match(panel, /population === "active"/);
  assert.match(api, /query\.set\("includeInactive", "true"\)/);
});

test("BI-10 permite detalhar alertas e navegar ao histórico preservando ids", async () => {
  const [page, panel, client] = await Promise.all([
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiDataHealthPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/services/andonBiService.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /loadDataQualityDetails/);
  assert.match(page, /setQualityCategory/);
  assert.match(page, /setQualityPage/);
  assert.match(page, /onMachineSelect/);
  assert.match(client, /\/api\/analytics\/data-quality-details/);
  assert.match(panel, /aria-pressed=\{category === type\}/);
  assert.match(panel, /onPageChange\(page \+ 1\)/);
  assert.match(panel, /machine\.id|machineId/);
  assert.match(panel, /encodeURIComponent\(item\.machineId\)/);
  assert.match(panel, /"failure-history"/);
  assert.match(panel, /"call-history"/);
  assert.match(panel, /testes manuais não marcados/i);
});
