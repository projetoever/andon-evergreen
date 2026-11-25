import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const headerFile = new URL("../src/components/machines/MachineDetailHeader.tsx", import.meta.url);

test("PENTE 6: nome da máquina fica em destaque, com ID sempre identificável", async () => {
  const source = await readFile(headerFile, "utf8");
  assert.match(source, /const machineName = machine\.name\?\.trim\(\) \|\| machine\.id/);
  assert.match(source, /<h1[\s\S]*?title=\{machineName\}[\s\S]*?aria-label=\{machineName\}[\s\S]*?\{machineName\}[\s\S]*?<\/h1>/);
  assert.match(source, /line-clamp-2/);
  assert.match(source, /\[overflow-wrap:anywhere\]/);
  assert.match(source, /text-2xl[\s\S]*?sm:text-3xl[\s\S]*?2xl:text-4xl/);
  assert.match(source, /<span className="font-semibold">\{t\("ID"\)\}:<\/span>/);
  assert.match(source, /<span className="break-all font-mono">\{machine\.id\}<\/span>/);
  assert.doesNotMatch(source, /truncate text-3xl|truncate text-xs/);
});

test("PENTE 6: a área de nome não é mais limitada a 8rem e controles têm linha própria", async () => {
  const source = await readFile(headerFile, "utf8");
  assert.match(source, /xl:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.doesNotMatch(source, /lg:grid-cols-\[minmax\(0,8rem\)_minmax\(0,1fr\)\]/);
  assert.match(source, /flex min-w-0 flex-wrap items-center justify-start gap-2/);
  assert.match(source, /xl:max-w-\[min\(52vw,52rem\)\]/);
  assert.match(source, /xl:col-span-2/);
  assert.match(source, /<MachineStatusBadge/);
  assert.match(source, /<AndonStatusBadge/);
  assert.match(source, /<ProductionModeBadge/);
});

test("PENTE 6: conserva navegação, permissões e interações da máquina", async () => {
  const source = await readFile(headerFile, "utf8");
  const page = await readFile(
    new URL("../src/pages/MachineDetailPage.tsx", import.meta.url), "utf8");
  assert.match(source, /!\s*screenLocked && \(\s*<Link/);
  assert.match(source, /!\s*screenLocked && <ModuleNavigation \/>/);
  assert.match(source, /historyAllowed && <Link/);
  assert.match(source, /onClick=\{onToggleMachineSound\}/);
  assert.match(source, /onClick=\{onToggleScreenLock\}/);
  assert.match(source, /<ClockDisplay \/>/);
  assert.match(page, /<MachineDetailHeader/);
  assert.match(page, /historyAllowed=\{access\?\.centralAccessEnabled === false/);
});
