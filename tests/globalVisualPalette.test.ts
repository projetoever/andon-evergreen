import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_VISUAL_PALETTE,
  INDUSTRIAL_VISUAL_PRESETS, paletteContrastRatio,
  accentForTheme, parseVisualPalette, presentationSurfaceForTheme, VISUAL_PALETTE_KEYS,
} from "../src/theme/andonVisualPalette";
import { VISUAL_PALETTE_POLL_MS } from "../src/theme/GlobalVisualPaletteProvider";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("UX-12: default global palette still avoids critical stop/warning colors", async () => {
  assert.equal(DEFAULT_VISUAL_PALETTE.cardBorder, "slate");
  assert.equal(VISUAL_PALETTE_KEYS.length, 10);
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
  assert.match(css, /\.andon-palette-machine-card,/);
  assert.match(css, /\.andon-palette-summary-card \{/);
  assert.match(await source("src/components/layout/StatusSummaryBar.tsx"),
    /andon-palette-summary-card/);
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

test("UX-21: six curated palettes also change safe dashboard, fault and priority presentation" , () => {
  assert.equal(INDUSTRIAL_VISUAL_PRESETS.length, 6);
  assert.deepEqual(INDUSTRIAL_VISUAL_PRESETS.map(p => p.id),
    ["operationalGreen", "contrastDark", "contrastLight", "industrialBlue", "warm", "neutral"]);
  assert.ok(INDUSTRIAL_VISUAL_PRESETS.every(preset =>
    !/evergreen/i.test(preset.label + " " + preset.description)),
    "Palette labels must not expose a specific customer brand");
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


test("CFG-15E: palette write authorization follows live server focus/events without draft loss", async () => {
  const preview = await source("src/components/settings/AppearanceSettingsPreview.tsx");
  assert.match(preview, /SYSTEM_SETTINGS_CHANGED_EVENT/);
  assert.match(preview, /window\.addEventListener\("focus", revalidate\)/);
  assert.match(preview, /window\.addEventListener\(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate\)/);
  assert.match(preview, /window\.removeEventListener\("focus", revalidate\)/);
  assert.match(preview, /window\.removeEventListener\(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate\)/);
  assert.match(preview, /const version = \+\+requestVersion/);
  assert.match(preview, /!active \|\| version !== requestVersion/);
  assert.match(preview, /setCapabilityChecking\(true\)/);
  assert.match(preview, /setCanWrite\(false\); \/\/ fail closed/);
  assert.match(preview, /latest\.revision !== revision/);
  assert.match(preview, /setConflict\(true\)/);
  assert.match(preview, /setCanWrite\(latest\.canWrite\)/);
  assert.match(preview, /setMessage\(previous => !latest\.canWrite/);
  assert.match(preview, /!allowGlobalSave \|\| !canWrite \|\| busy \|\| loading \|\| capabilityChecking \|\| conflict/);
  assert.match(preview, /disabled=\{!canWrite \|\| !changed \|\| busy \|\| loading \|\| capabilityChecking \|\| conflict/);
  assert.match(preview, /disabled=\{!canWrite \|\| busy \|\| loading \|\| capabilityChecking \|\| conflict\}/);
  const revalidate = preview.split("const revalidate = () => {")[1]?.split('window.addEventListener("focus"')[0];
  assert.ok(revalidate);
  assert.doesNotMatch(revalidate, /setDraft\(|setSaved\(|setRevision\(|event\.detail/);
  assert.match(preview, /Não foi possível confirmar a disponibilidade da paleta/);
});


test("UX-21: surface presets produce distinct dashboards and readable dark/light preview", async () => {
  const keys = ["dashboardBackground", "machineSurface", "failureSurface", "prioritySurface"] as const;
  const variations = INDUSTRIAL_VISUAL_PRESETS.map(preset =>
    keys.map(key => preset.palette[key]).join("|"));
  assert.equal(new Set(variations).size, INDUSTRIAL_VISUAL_PRESETS.length);
  for (const preset of INDUSTRIAL_VISUAL_PRESETS) {
    const parsed = parseVisualPalette(preset.palette);
    assert.ok(parsed, preset.id);
    for (const key of keys) assert.ok(parsed[key], preset.id + ": " + key);
    for (const mode of ["light", "dark"] as const) {
      const background = presentationSurfaceForTheme(preset.palette.dashboardBackground, mode, "dashboard");
      const card = presentationSurfaceForTheme(preset.palette.machineSurface, mode, "machine");
      assert.match(background, /^#[0-9A-F]{6}$/);
      assert.match(card, /^#[0-9A-F]{6}$/);
      const foreground = mode === "dark" ? "#F8FAFC" : "#182531";
      assert.ok(paletteContrastRatio(background, foreground) >= 4.5, preset.id + " " + mode + ": dashboard");
      assert.ok(paletteContrastRatio(card, foreground) >= 4.5, preset.id + " " + mode + ": card");
    }
  }

  const [provider, css, card, grid, dashboard, picker, preview] = await Promise.all([
    source("src/theme/GlobalVisualPaletteProvider.tsx"),
    source("src/styles.css"),
    source("src/components/machines/MachineCard.tsx"),
    source("src/components/machines/MachineGrid.tsx"),
    source("src/pages/DashboardPage.tsx"),
    source("src/components/settings/VisualAccentRgbPicker.tsx"),
    source("src/components/settings/AppearanceSettingsPreview.tsx"),
  ]);
  for (const variable of [
    "--andon-palette-dashboard-background", "--andon-palette-machine-surface",
    "--andon-palette-failure-surface", "--andon-palette-priority-surface",
  ]) assert.match(provider + css, new RegExp(variable));
  assert.match(dashboard, /andon-palette-dashboard-root/);
  assert.match(card, /andon-palette-failure-highlight/);
  assert.match(grid, /andon-palette-priority-border/);
  assert.match(css, /color-mix\(in srgb/);
  assert.match(provider, /presentationSurfaceForTheme\(/);
  assert.doesNotMatch(provider, /--danger|--warning|--success|--primary/);
  assert.match(preview, /fieldLabels/);
  assert.match(preview, /draft\.failureSurface/);
  assert.match(preview, /draft\.prioritySurface/);
  assert.match(preview, /sm:grid-cols-2 xl:grid-cols-3/);
  assert.match(picker, /className="grid grid-cols-3 gap-2" aria-label=\{ui\("Canais RGB"\)\}/);
  assert.match(picker, /channel\.toUpperCase\(\)/);
  assert.match(picker, /onPointerMove/);
  assert.match(picker, /onSpectrumKeyDown/);
});

test("UX-21: persisted v1 five/six-color palettes upgrade additively and reject invalid surface payloads", () => {
  const five = {
    version: 1, cardBorder: "slate", selectedCardBorder: "evergreen",
    sectorSelection: "ocean", operationAccent: "indigo", focusAccent: "violet",
  };
  const old = parseVisualPalette(five);
  assert.ok(old);
  assert.equal(old.dashboardBackground, DEFAULT_VISUAL_PALETTE.dashboardBackground);
  assert.equal(old.machineSurface, DEFAULT_VISUAL_PALETTE.machineSurface);
  assert.equal(old.failureSurface, DEFAULT_VISUAL_PALETTE.failureSurface);
  assert.equal(old.prioritySurface, DEFAULT_VISUAL_PALETTE.prioritySurface);
  const six = parseVisualPalette({ ...five, priorityBorder: "#FFB454" });
  assert.equal(six?.priorityBorder, "#FFB454");
  for (const bad of ["#fff", "rgba(1,2,3,0.5)", "var(--danger)", "transparent"]) {
    assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, failureSurface: bad }), null);
    assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, dashboardBackground: bad }), null);
  }
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, danger: "#FFFFFF" }), null);
});
