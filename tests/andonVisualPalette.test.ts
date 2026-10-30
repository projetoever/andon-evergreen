import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_VISUAL_PALETTE, VISUAL_PALETTE_KEYS, VISUAL_ACCENTS,
  parseVisualPalette, restoreDefaultVisualPalette, accentForTheme,
} from "../src/theme/andonVisualPalette";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("UX-12 stage 1: immutable versioned default and simultaneous theme accents", () => {
  assert.equal(DEFAULT_VISUAL_PALETTE.version, 1);
  assert.equal(VISUAL_PALETTE_KEYS.length, 5);
  assert.deepEqual(Object.keys(DEFAULT_VISUAL_PALETTE).sort(), ["version", ...VISUAL_PALETTE_KEYS].sort());
  assert.ok(Object.isFrozen(DEFAULT_VISUAL_PALETTE));
  const draft = restoreDefaultVisualPalette();
  assert.deepEqual(draft, DEFAULT_VISUAL_PALETTE);
  assert.notEqual(draft, DEFAULT_VISUAL_PALETTE);
  for (const accent of Object.keys(VISUAL_ACCENTS) as Array<keyof typeof VISUAL_ACCENTS>) {
    for (const theme of ["light", "dark"] as const) {
      assert.match(accentForTheme(accent, theme), /^#[0-9a-fA-F]{6}$/);
    }
  }
  assert.notEqual(accentForTheme("evergreen", "dark"), accentForTheme("evergreen", "light"));
});

test("UX-12 stage 1: reject arbitrary CSS, status-token poisoning and schema drift", () => {
  assert.deepEqual(parseVisualPalette(DEFAULT_VISUAL_PALETTE), DEFAULT_VISUAL_PALETTE);
  assert.equal(parseVisualPalette(null), null);
  assert.equal(parseVisualPalette([]), null);
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, version: 2 }), null);
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, danger: "ocean" }), null);
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, warning: "indigo" }), null);
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, cardBorder: "#ff0000" }), null);
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, cardBorder: "var(--danger)" }), null);
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, cardBorder: "red;filter:invert(1)" }), null);
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, cardBorder: undefined }), null);
  const { cardBorder: _ignored, ...missing } = DEFAULT_VISUAL_PALETTE;
  assert.equal(parseVisualPalette(missing), null);
});

test("UX-12 stage 1: admin-only local preview, no global write or alarm mutation", async () => {
  const preview = await source("src/components/settings/AppearanceSettingsPreview.tsx");
  const legacy = await source("src/components/settings/AdminSettingsModal.tsx");
  const central = await source("src/pages/HubCentralAdminPage.tsx");
  assert.match(legacy, /if \(tab === "appearance"\) return <AppearanceSettingsPreview \/>/);
  assert.match(central, /<AppearanceSettingsPreview allowGlobalSave \/>/);
  assert.match(preview, /\(\["dark", "light"\] as const\)\.map/);
  assert.match(preview, /onClick=\{\(\) => setDraft\(restoreDefaultVisualPalette\(\)\)\}/);
  assert.doesNotMatch(preview, /updateSystemSettings|fetch\(|apiClient|localStorage|sessionStorage/);
  assert.doesNotMatch(preview, /--danger\s*:|--warning\s*:|setProperty\(/);
  assert.match(preview, /sem aplicação global/);
});
