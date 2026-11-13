import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_VISUAL_PALETTE,
  INDUSTRIAL_VISUAL_PRESETS, paletteContrastRatio,
  accentForTheme, parseVisualPalette, VISUAL_PALETTE_KEYS,
} from "../src/theme/andonVisualPalette";
import { VISUAL_PALETTE_POLL_MS } from "../src/theme/GlobalVisualPaletteProvider";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("UX-12: default global palette still avoids critical stop/warning colors", async () => {
  assert.equal(DEFAULT_VISUAL_PALETTE.cardBorder, "slate");
  assert.equal(VISUAL_PALETTE_KEYS.length, 6);
  assert.equal(VISUAL_PALETTE_POLL_MS, 30_000);
  for (const key of VISUAL_PALETTE_KEYS) {
    assert.match(accentForTheme(DEFAULT_VISUAL_PALETTE[key], "light"), /^#[0-9a-fA-F]{6}$/);
    assert.match(accentForTheme(DEFAULT_VISUAL_PALETTE[key], "dark"), /^#[0-9a-fA-F]{6}$/);
  }
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, danger: "ocean" }), null);
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, warning: "violet" }), null);
  const custom = parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, cardBorder: "#102FBC" });
  assert.equal(custom?.cardBorder, "#102FBC");
  assert.equal(accentForTheme("#102FBC", "dark"), "#102FBC");
  assert.equal(accentForTheme("#102FBC", "light"), "#102FBC");
});

test("UX-12: local theme never becomes globally shared and polling uses guarded settings GET", async () => {
  const [provider, theme, root, service, server] = await Promise.all([
    source("src/theme/GlobalVisualPaletteProvider.tsx"),
    source("src/theme/ThemeProvider.tsx"),
    source("src/routes/__root.tsx"),
    source("src/services/visualPaletteService.ts"),
    source("server/src/services/systemSettings.ts"),
  ]);
  assert.match(root, /<ThemeProvider><GlobalVisualPaletteProvider>/);
  assert.match(provider, /readGlobalVisualPalette\(\)/);
  assert.match(provider, /VISUAL_PALETTE_POLL_MS/);
  assert.match(provider, /window\.addEventListener\("andon:global-palette-changed"/);
  assert.match(provider, /window\.addEventListener\("focus"/);
  assert.match(provider, /accentForTheme\(current\.palette\[key\], theme\)/);
  assert.doesNotMatch(provider, /setItem\(|localStorage|sessionStorage/);
  assert.match(theme, /THEME_STORAGE_KEY = "andon\.theme\.v1"/);
  assert.match(service, /getSystemSettings\(\)/);
  assert.match(server, /centralVisualPaletteWritesEnabled\(\)/);
});

test("UX-12/R10-09: global palette save requires central ANDON settings delegation and server flag", async () => {
  const [legacy, central, preview, service, client] = await Promise.all([
    source("src/components/settings/AdminSettingsModal.tsx"),
    source("src/pages/HubCentralAdminPage.tsx"),
    source("src/components/settings/AppearanceSettingsPreview.tsx"),
    source("src/services/visualPaletteService.ts"),
    source("src/api/andonApiClient.ts"),
  ]);
  assert.match(legacy, /<AppearanceSettingsPreview allowGlobalSave=\{centralAccess\} \/>/);
  assert.doesNotMatch(central, /<AppearanceSettingsPreview allowGlobalSave \/>/);
  assert.match(preview, /!allowGlobalSave \|\| !canWrite/);
  assert.match(preview, /disabled=\{!canWrite \|\| !changed/);
  assert.match(preview, /Confirmar restauração global/);
  assert.match(service, /expectedRevision/);
  assert.match(preview, /error\.status === 409/);
  assert.match(preview, /CustomEvent\("andon:global-palette-changed"\)/);
  assert.match(service, /apiClient\.patch<\{/);
  assert.match(service, /"\/api\/andon-visual-palette"/);
  assert.match(client, /\(method === "PATCH" && path === "\/api\/andon-visual-palette"\)/);
  assert.doesNotMatch(service, /updateSystemSettings/);
});

test("UX-12: global colors target non-critical components and never override danger/warning", async () => {
  const [card, sector, css, provider] = await Promise.all([
    source("src/components/machines/MachineCard.tsx"),
    source("src/components/machines/MachineActionPanel.tsx"),
    source("src/styles.css"),
    source("src/theme/GlobalVisualPaletteProvider.tsx"),
  ]);
  assert.match(card, /cardAttentionTone === null && !isCritical && !isWarning && "andon-palette-machine-card"/);
  assert.match(sector, /borderColor: !activeCall \|\| selected \? accentColor : undefined/);
  assert.match(css, /--andon-palette-sector-selection/);
  assert.match(css, /--andon-palette-selected-card-border/);
  assert.match(css, /\.andon-palette-machine-card \{/);
  assert.match(css, /\.andon-palette-operation-button \{/);
  assert.match(provider, /--andon-palette-card-border/);
  assert.match(provider, /--andon-palette-priority-border/);
  assert.match(css, /\.andon-palette-priority-border/);
  assert.match(await source("src/components/machines/MachineGrid.tsx"), /andon-palette-priority-border/);
  assert.doesNotMatch(provider, /--danger|--warning|--success|--primary/);
  assert.doesNotMatch(css, /\.andon-palette-machine-card\s*\{[^}]*opacity\s*:/);
});

test("UX-19: old five-color palettes remain valid and preserve their configured accents", () => {
  const legacy = { version:1, cardBorder:"#112233", selectedCardBorder:"ocean",
    sectorSelection:"evergreen", operationAccent:"violet", focusAccent:"slate" };
  const upgraded = parseVisualPalette(legacy);
  assert.ok(upgraded);
  assert.equal(upgraded.cardBorder, "#112233");
  assert.equal(upgraded.priorityBorder, DEFAULT_VISUAL_PALETTE.priorityBorder);
  assert.equal(parseVisualPalette({ ...legacy, priorityBorder:"url(evil)" }), null);
  assert.equal(parseVisualPalette({ ...legacy, priorityBorder:"#BADA55" })?.priorityBorder, "#BADA55");
  assert.equal(parseVisualPalette({ ...legacy, priorityBorder:"#fff" }), null);
});

test("UX-19: six curated palettes change only allowlisted accents and warn for low contrast", () => {
  assert.equal(INDUSTRIAL_VISUAL_PRESETS.length, 6);
  assert.deepEqual(INDUSTRIAL_VISUAL_PRESETS.map(p => p.id),
    ["evergreen", "contrastDark", "contrastLight", "industrialBlue", "warm", "neutral"]);
  for (const preset of INDUSTRIAL_VISUAL_PRESETS) {
    assert.ok(parseVisualPalette(preset.palette), preset.id);
    assert.deepEqual(Object.keys(preset.palette).sort(), ["version", ...VISUAL_PALETTE_KEYS].sort());
  }
  assert.ok(paletteContrastRatio("#FFFFFF", "#000000") >= 20);
  assert.ok(paletteContrastRatio("#555555", "#555555") < 3);
  assert.ok(paletteContrastRatio("#000000", "#FFFFFF") > 7);
});

test("UX-19: preset picker previews priority border, keeps safety warnings and requires guarded save", async () => {
  const [preview, grid, css, server] = await Promise.all([
    source("src/components/settings/AppearanceSettingsPreview.tsx"),
    source("src/components/machines/MachineGrid.tsx"),
    source("src/styles.css"),
    source("server/src/services/andonVisualPalette.ts"),
  ]);
  assert.match(preview, /INDUSTRIAL_VISUAL_PRESETS\.map/);
  assert.match(preview, /setDraft\(\{ \.\.\.preset\.palette \}\)/);
  assert.match(preview, /draft\.priorityBorder/);
  assert.match(preview, /paletteContrastRatio/);
  assert.match(preview, /persist\(draft\)/);
  assert.match(grid, /data-production-priority-group/);
  assert.match(grid, /andon-palette-priority-border/);
  assert.match(css, /--andon-palette-priority-border/);
  assert.doesNotMatch(css, /--andon-palette-danger|--andon-palette-warning/);
  assert.match(server, /priorityBorder/);
});
