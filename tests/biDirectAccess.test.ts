import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("rota do ANDON BI nao inicializa providers operacionais", async () => {
  const root = await readFile(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");

  assert.match(root, /state\.location\.pathname === "\/bi"/);
  assert.match(root, /state\.location\.pathname\.startsWith\("\/bi\/"\)/);
  assert.match(root, /if \(isBiRoute\)/);

  const biRouteIndex = root.indexOf("if (isBiRoute)");
  const normalRouteIndex = root.indexOf("\n  return (\n    <WorkstationAccessGate>", biRouteIndex);
  assert.ok(normalRouteIndex > biRouteIndex, "Rota BI deve ter ramo isolado antes da tela operacional");
  const isolatedBranch = root.slice(biRouteIndex, normalRouteIndex);
  assert.doesNotMatch(isolatedBranch, /AndonProvider|TechnicianProvider|VirtualKeyboard/);
  assert.match(isolatedBranch, /<WorkstationAccessGate>/);
});

test("dashboard operacional oferece entrada direta para o ANDON BI", async () => {
  const dashboard = await readFile(
    new URL("../src/pages/DashboardPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /title=\{t\("Abrir ANDON BI"\)\}/);
  assert.match(dashboard, /navigate\(\{ to: "\/bi" \}\)/);
});

test("atalho de desktop aponta diretamente para a rota do ANDON BI", async () => {
  const shortcut = await readFile(
    new URL("../installer/create-andon-bi-desktop-shortcut.ps1", import.meta.url),
    "utf8",
  );

  assert.match(shortcut, /\$biUrl = "\$baseUrl\/bi"/);
  assert.match(shortcut, /ANDON BI\.url/);
});
