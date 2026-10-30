import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_THEME, THEME_STORAGE_KEY, parseAndonTheme } from "../src/theme/ThemeProvider";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("UX-11: existing terminals default to the industrial dark palette", async () => {
  assert.equal(DEFAULT_THEME, "dark");
  assert.equal(parseAndonTheme(null), "dark");
  assert.equal(parseAndonTheme(undefined), "dark");
  assert.equal(parseAndonTheme("invalid"), "dark");
  assert.equal(parseAndonTheme("auto"), "dark");
  assert.equal(parseAndonTheme("light"), "light");
  assert.equal(parseAndonTheme("dark"), "dark");
  assert.equal(THEME_STORAGE_KEY, "andon.theme.v1");

  const root = await source("src/routes/__root.tsx");
  assert.match(root, /<html lang="pt-BR" className="dark">/);
  assert.match(root, /<ThemeProvider><GlobalVisualPaletteProvider><LanguageProvider>\{children\}<\/LanguageProvider><\/GlobalVisualPaletteProvider><\/ThemeProvider>/);
});

test("UX-11: theme remains device-local, hydrated after SSR and synced between tabs", async () => {
  const provider = await source("src/theme/ThemeProvider.tsx");
  assert.match(provider, /useState<AndonTheme>\(DEFAULT_THEME\)/);
  assert.match(provider, /window\.localStorage\.getItem\(THEME_STORAGE_KEY\)/);
  assert.match(provider, /window\.localStorage\.setItem\(THEME_STORAGE_KEY, theme\)/);
  assert.match(provider, /window\.addEventListener\("storage", onStorage\)/);
  assert.match(provider, /window\.removeEventListener\("storage", onStorage\)/);
  assert.match(provider, /if \(!hydrated\) return;/);
  assert.match(provider, /document\.documentElement\.classList\.toggle\("light"/);
  assert.doesNotMatch(provider, /getSystemSettings|updateSystemSettings|fetch\(|\/api\//);
});

test("UX-11: all module header language controls expose an accessible theme toggle", async () => {
  const control = await source("src/components/layout/LanguageSelector.tsx");
  assert.match(control, /aria-pressed=\{theme === "light"\}/);
  assert.match(control, /aria-label=\{toggleLabel\}/);
  assert.match(control, /focus-visible:ring-2/);
  assert.match(control, /setTheme\(theme === "dark" \? "light" : "dark"\)/);
  for (const path of [
    "src/pages/HubPage.tsx",
    "src/pages/DashboardPage.tsx",
    "src/pages/AndonBiPage.tsx",
    "src/pages/DashboardPriorityPage.tsx",
  ]) {
    assert.match(await source(path), /<LanguageSelector(?: compact)?\s*\/>/, path);
  }
});

test("UX-11: light palette changes structural colors without muting danger/warning semantics", async () => {
  const css = await source("src/styles.css");
  assert.match(css, /:root\.light \{/);
  assert.match(css, /:root\.dark \{/);
  assert.match(css, /--background: oklch\(0\.98 0\.007 240\)/);
  const light = css.slice(css.indexOf(":root.light {"), css.indexOf(":root.dark {"));
  for (const token of ["--foreground", "--card", "--popover", "--border", "--ring", "--warning", "--danger", "--success", "--info"]) {
    assert.ok(light.includes(token + ":"), `Missing semantic token ${token} for light mode`);
  }
  assert.doesNotMatch(css, /filter:\s*invert\(/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
