import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) =>
  readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("MOB 1: Hub e ANDON usam navegação agrupada acessível sem retirar a lateral desktop", async () => {
  const shell = await source("components/settings/AdminWorkspaceShell.tsx");
  assert.match(shell, /<Sheet open=\{mobileNavigationOpen\} onOpenChange=\{setMobileNavigationOpen\}>/);
  assert.match(shell, /aria-expanded=\{mobileNavigationOpen\}/);
  assert.match(shell, /selected\?\.label \|\| title/);
  assert.match(shell, /items\.filter\(item => \(item\.group \|\| "Administração"\) === group\)/);
  assert.match(shell, /onSelect\(item\.id\); setMobileNavigationOpen\(false\)/);
  assert.match(shell, /to="\/hub\/admin" search=\{\{ section: item\.id as HubAdminSection \}\}/);
  assert.match(shell, /<aside className="hidden/);
  assert.match(shell, /lg:grid-cols-\[280px_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(shell, /setCookie|sessionStorage|localStorage|passwordRequired/);
});

test("MOB 1: BI mostra todas as cinco abas em seletor mobile e preserva tabs desktop", async () => {
  const tabs = await source("components/bi/BiWorkspaceTabs.tsx");
  for (const tab of ["overview", "reliability", "failures", "maintenance", "data-quality"])
    assert.ok(tabs.includes(`id: "${tab}"`), tab);
  assert.match(tabs, /<select\s+value=\{activeTab\}/);
  assert.match(tabs, /onChange=\{\(event\) => onChange\(event\.target\.value as BiWorkspaceTab\)\}/);
  assert.match(tabs, /sm:hidden/);
  assert.match(tabs, /sm:flex lg:grid/);
  assert.match(tabs, /attentionCount > 0/);
});

test("MOB 1: histórico mantém campos integrais em cards mobile e tabela desktop", async () => {
  const history = await source("components/history/HistoryTable.tsx");
  assert.match(history, /<details key=\{call\.id\}/);
  assert.match(history, /lg:hidden/);
  assert.match(history, /lg:block/);
  assert.match(history, /<table className="w-full text-left text-sm">/);
  for (const label of ["Motivo da correção", "Conclusão da manutenção", "Tempo de ANDON",
    "Tempo de atendimento", "Acompanhamento", "Em falha", "Retornos", "Técnico(s)", "Condição", "Descrição"])
    assert.ok(history.includes(label), label);
  assert.match(history, /call\.isSystemTest/);
});

test("MOB 1: modais e dados BI permitem leitura e toque em viewport estreito", async () => {
  const [dialog, alertDialog, sheet, styles, coverage, machine] = await Promise.all([
    source("components/ui/dialog.tsx"),
    source("components/ui/alert-dialog.tsx"),
    source("components/ui/sheet.tsx"),
    source("styles.css"),
    source("components/bi/BiProductionCoverageDialog.tsx"),
    source("components/bi/BiMachine360Overlay.tsx"),
  ]);
  assert.match(dialog, /mobile-dialog fixed/);
  assert.match(dialog, /h-11 w-11/);
  assert.match(alertDialog, /sm:p-6/);
  assert.match(sheet, /h-11 w-11/);
  assert.match(styles, /--visible-height/);
  assert.match(styles, /overflow-x: hidden/);
  assert.match(coverage, /sm:hidden/);
  assert.match(coverage, /sm:table/);
  assert.match(coverage, /ui\(LABELS\[row\.status\]\)/);
  assert.match(coverage, /ui\(REASONS\[row\.reason\]\)/);
  assert.match(machine, /sm:h-\[calc\(100dvh-24px\)\]/);
  assert.match(machine, /onClick=\{onClose\}/);
});

test("MOB 1: testes reais do navegador exercitam drawer no celular e layout desktop", async () => {
  const script = await readFile(new URL("./browser/hubAdminNavigation.mjs", import.meta.url), "utf8");
  assert.match(script, /width: 390, height: 844/);
  assert.match(script, /width: 1366, height: 768/);
  assert.match(script, /openAdminNav/);
  assert.match(script, /clickAdminItem/);
  assert.match(script, /assertActiveAdminItem/);
  assert.match(script, /await noOverflow\(\)/);
  assert.match(script, /await page\.screenshot/);
});
