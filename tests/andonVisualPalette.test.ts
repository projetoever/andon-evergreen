import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  hexToHsv, hexToRgb, hsvToHex, hsvToRgb, rgbToHex,
} from "../src/theme/colorPickerMath";
import {
  DEFAULT_VISUAL_PALETTE, VISUAL_PALETTE_KEYS, VISUAL_ACCENTS,
  parseVisualPalette, restoreDefaultVisualPalette, accentForTheme,
} from "../src/theme/andonVisualPalette";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("UX-12 stage 1: immutable versioned default and simultaneous theme accents", () => {
  assert.equal(DEFAULT_VISUAL_PALETTE.version, 1);
  assert.equal(VISUAL_PALETTE_KEYS.length, 6);
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

test("UX-12: strict custom RGB is allowed, arbitrary CSS/status fields rejected", () => {
  assert.deepEqual(parseVisualPalette(DEFAULT_VISUAL_PALETTE), DEFAULT_VISUAL_PALETTE);
  assert.equal(parseVisualPalette(null), null);
  assert.equal(parseVisualPalette([]), null);
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, version: 2 }), null);
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, danger: "ocean" }), null);
  assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, warning: "indigo" }), null);
  assert.deepEqual(
    parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, cardBorder: "#ff0000" }),
    { ...DEFAULT_VISUAL_PALETTE, cardBorder: "#ff0000" },
  );
  assert.equal(accentForTheme("#9b24e7", "dark"), "#9B24E7");
  assert.equal(accentForTheme("#9b24e7", "light"), "#9B24E7");
  for (const bad of ["#fff", "#11223344", "#GG0000", "rgb(1,2,3)", "red", "transparent"]) {
    assert.equal(parseVisualPalette({ ...DEFAULT_VISUAL_PALETTE, cardBorder: bad }), null);
  }
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
  assert.match(legacy, /if \(tab === "appearance"\) return <AppearanceSettingsPreview allowGlobalSave=\{centralAccess\} \/>/);
  assert.doesNotMatch(central, /<AppearanceSettingsPreview allowGlobalSave \/>/);
  assert.match(preview, /\(\["dark", "light"\] as const\)\.map/);
  assert.match(preview, /<VisualAccentRgbPicker/);
  assert.doesNotMatch(preview, /<select/);
  const picker = await source("src/components/settings/VisualAccentRgbPicker.tsx");
  assert.match(picker, /linear-gradient\(to top/);
  assert.match(picker, /setPointerCapture/);
  assert.match(picker, /onPointerMove/);
  assert.match(picker, /onSpectrumKeyDown/);
  assert.match(picker, /type="range"/);
  assert.match(picker, /type="number"/);
  assert.match(picker, /isCustomVisualHex/);
  assert.match(picker, /max=\{255\}/);
  assert.doesNotMatch(picker, /type="color"/);
  assert.match(preview, /onClick=\{\(\) => setDraft\(restoreDefaultVisualPalette\(\)\)\}/);
  assert.doesNotMatch(preview, /updateSystemSettings|fetch\(|apiClient|localStorage|sessionStorage/);
  assert.doesNotMatch(preview, /--danger\s*:|--warning\s*:|setProperty\(/);
  assert.match(preview, /sem aplicação global/);
});

test("UX-12 Windows color selector: HSV full spectrum round-trips RGB without alpha", () => {
  for (const hex of ["#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#59F7FF", "#33A1C9", "#A71940"]) {
    const hsv = hexToHsv(hex);
    assert.equal(hsvToHex(hsv), hex, `HSV roundtrip for ${hex}`);
    const rgb = hexToRgb(hex);
    assert.equal(rgbToHex(rgb), hex);
    assert.deepEqual(hsvToRgb(hsv), rgb);
  }
  assert.equal(hsvToHex({ h: 0, s: 1, v: 1 }), "#FF0000");
  assert.equal(hsvToHex({ h: 120, s: 1, v: 1 }), "#00FF00");
  assert.equal(hsvToHex({ h: 180, s: 1, v: 1 }), "#00FFFF");
  assert.equal(hsvToHex({ h: 240, s: 1, v: 1 }), "#0000FF");
  assert.equal(hsvToHex({ h: 300, s: 1, v: 0 }), "#000000");
  assert.equal(hsvToHex({ h: 180, s: 0, v: 1 }), "#FFFFFF");
  for (const invalid of ["#ABC", "#1234567", "red", "rgba(1,2,3,.4)"]) {
    assert.throws(() => hexToRgb(invalid), /invalid_hex_color/);
  }
  for (const invalid of [{ r: -1, g: 1, b: 1 }, { r: 256, g: 1, b: 1 }, { r: 1.5, g: 1, b: 1 }]) {
    assert.throws(() => rgbToHex(invalid), /invalid_rgb_channel/);
  }
});
