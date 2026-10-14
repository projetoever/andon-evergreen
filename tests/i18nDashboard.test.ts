import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  isAndonLanguage,
  translateLabel,
} from "../src/i18n/LanguageProvider";

test("ANDON supports Portuguese, English and Traditional Chinese without modifying domain data", () => {
  assert.equal(DEFAULT_LANGUAGE, "pt-BR");
  assert.deepEqual(LANGUAGE_OPTIONS.map(option => option.value), ["pt-BR", "en", "zh-TW"]);
  assert.equal(translateLabel("pt-BR", "Em atendimento"), "Em atendimento");
  assert.equal(translateLabel("en", "Em atendimento"), "In service");
  assert.equal(translateLabel("zh-TW", "Em atendimento"), "維修處理中");
  assert.equal(translateLabel("en", "Custom Sector 37"), "Custom Sector 37");
  assert.equal(translateLabel("zh-TW", "Falha informada pelo operador"), "Falha informada pelo operador");
  assert.ok(isAndonLanguage("zh-TW"));
  assert.equal(isAndonLanguage("zh-CN"), false);
  assert.equal(LANGUAGE_STORAGE_KEY, "andon.interfaceLanguage");
});

test("dashboard language choice is accessible and shared with machine and BI routes", async () => {
  const [root, dashboard, selector, badges, machine, bi] = await Promise.all([
    readFile(new URL("../src/routes/__root.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/layout/LanguageSelector.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/machines/MachineActionPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/machines/MachineCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(root, /<LanguageProvider>\{children\}<\/LanguageProvider>/);
  assert.match(dashboard, /<LanguageSelector \/>/);
  assert.match(selector, /aria-label=\{t\("Idioma da interface"\)\}/);
  assert.match(selector, /onChange=\{\(event\) => setLanguage\(/);
  assert.match(badges, /t\("Atender selecionado"\)/);
  assert.match(machine, /t\("Ver Máquina"\)/);
  assert.match(bi, /t\("Exportar PDF"\)/);
});

test("language preference is client-only and does not affect operational API requests", async () => {
  const [language, api] = await Promise.all([
    readFile(new URL("../src/i18n/LanguageProvider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/api/andonApiClient.ts", import.meta.url), "utf8"),
  ]);
  assert.match(language, /useState<AndonLanguage>\(DEFAULT_LANGUAGE\)/);
  assert.match(language, /window\.localStorage\.getItem\(LANGUAGE_STORAGE_KEY\)/);
  assert.match(language, /document\.documentElement\.lang = language/);
  assert.doesNotMatch(api, /LANGUAGE_STORAGE_KEY|interfaceLanguage/);
});
