import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_VISUAL_PALETTE,
  accentForTheme, parseVisualPalette, VISUAL_PALETTE_KEYS,
} from "../src/theme/andonVisualPalette";
import { VISUAL_PALETTE_POLL_MS } from "../src/theme/GlobalVisualPaletteProvider";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("UX-12: default global palette still avoids critical stop/warning colors", async () => {
  assert.equal(DEFAULT_VISUAL_PALETTE.cardBorder, "slate");
  assert.equal(VISUAL_PALETTE_KEYS.length, 5);
  assert.equal(VISUAL_PALETTE_POLL_MS, 30_000);
  for (const key of VISUAL_PALETTE_KEYS) {
    assert.match(accentForTheme(DEFAULT_VISUAL_PALETTE[key], "light"), /^#[0-9a-fA-F]{6}$/);
    assert.match(accentForTheme(DEFAULT_VISUAL_PALETTE[key], "dark"), /^#[0-9a-fA-F]{6}$/);
  }
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, danger: "ocean" }), null);
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, warning: "violet" }), null);
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

test("UX-12: global save is accessible only to Hub primary Admin when server flag permits", async () => {
  const [legacy, central, preview, service, client] = await Promise.all([
    source("src/components/settings/AdminSettingsModal.tsx"),
    source("src/pages/HubCentralAdminPage.tsx"),
    source("src/components/settings/AppearanceSettingsPreview.tsx"),
    source("src/services/visualPaletteService.ts"),
    source("src/api/andonApiClient.ts"),
  ]);
  assert.match(legacy, /<AppearanceSettingsPreview \/>/);
  assert.match(central, /<AppearanceSettingsPreview allowGlobalSave \/>/);
  assert.match(preview, /canWrite &&/);
  assert.match(preview, /disabled=\{!canWrite \|\| !changed/);
  assert.match(preview, /Confirmar restauração global/);
  assert.match(preview, /expectedRevision/);
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
  assert.match(sector, /--andon-palette-sector-selection/);
  assert.match(sector, /--andon-palette-selected-card-border/);
  assert.match(css, /\.andon-palette-machine-card \{/);
  assert.match(css, /\.andon-palette-operation-button \{/);
  assert.match(provider, /--andon-palette-card-border/);
  assert.doesNotMatch(provider, /--danger|--warning|--success|--primary/);
  assert.doesNotMatch(css, /\.andon-palette-machine-card\s*\{[^}]*opacity\s*:/);
});
