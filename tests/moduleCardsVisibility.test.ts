import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = () => readFile(new URL("../src/components/layout/ModuleCards.tsx", import.meta.url), "utf8");

test("REFINE9: denied modules remain visible with lock and never render Link", async () => {
  const ui = await source();
  assert.match(ui, /const modules = access\?\.modules \?\? \[\]/);
  assert.doesNotMatch(ui, /filter\(\(module\) => module\.available && module\.enabled && module\.allowed\)/);
  assert.match(ui, /const permitted = module\.available && module\.enabled && module\.allowed/);
  assert.match(ui, /return permitted \? \(/);
  assert.match(ui, /aria-disabled="true"/);
  assert.match(ui, /cursor-not-allowed/);
  assert.match(ui, /<Lock className=/);
  assert.match(ui, /Acesso restrito ao perfil do usuário conectado/);
  assert.match(ui, /Módulo indisponível nesta instalação/);
});

test("REFINE9: central API remains authoritative for all module grants", async () => {
  const [modules, guard] = await Promise.all([
    readFile(new URL("../server/src/routes/modules.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/security/workstationAccess.ts", import.meta.url), "utf8"),
  ]);
  assert.match(modules, /allowed: permitted\(module\)/);
  assert.match(modules, /assertModule\(principal, workstation, module\.id\)/);
  assert.match(guard, /assertModule\(principal, workstation, module\)/);
});
