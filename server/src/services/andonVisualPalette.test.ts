import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STORED_VISUAL_PALETTE,
  VISUAL_PALETTE_ACCENTS,
  VISUAL_PALETTE_FIELDS,
  parseStoredVisualPalette,
  publicVisualPalette,
  publicVisualPaletteRevision,
} from "./andonVisualPalette.js";

test("UX-12: strict stored palette maintains the existing industrial default", () => {
  assert.equal(DEFAULT_STORED_VISUAL_PALETTE.version, 1);
  assert.equal(DEFAULT_STORED_VISUAL_PALETTE.cardBorder, "slate");
  assert.deepEqual(parseStoredVisualPalette(DEFAULT_STORED_VISUAL_PALETTE), DEFAULT_STORED_VISUAL_PALETTE);
  assert.deepEqual(publicVisualPalette({}), DEFAULT_STORED_VISUAL_PALETTE);
  assert.ok(Object.isFrozen(DEFAULT_STORED_VISUAL_PALETTE));
  assert.equal(VISUAL_PALETTE_FIELDS.length, 5);
  assert.equal(VISUAL_PALETTE_ACCENTS.length, 5);
  assert.equal(publicVisualPaletteRevision(0), 0);
  assert.equal(publicVisualPaletteRevision(2), 2);
});

test("UX-12: reject arbitrary CSS, status colors, malformed data, revision poison", () => {
  for (const raw of [
    null, false, [], {}, { version: 1 },
    { ...DEFAULT_STORED_VISUAL_PALETTE, version: 2 },
    { ...DEFAULT_STORED_VISUAL_PALETTE, cardBorder: "#ff0000" },
    { ...DEFAULT_STORED_VISUAL_PALETTE, focusAccent: "var(--danger)" },
    { ...DEFAULT_STORED_VISUAL_PALETTE, danger: "ocean" },
    { ...DEFAULT_STORED_VISUAL_PALETTE, warning: "violet" },
    { ...DEFAULT_STORED_VISUAL_PALETTE, __proto__: "surprise", unexpected: true },
  ]) {
    assert.equal(parseStoredVisualPalette(raw), null);
    assert.deepEqual(publicVisualPalette(raw), DEFAULT_STORED_VISUAL_PALETTE);
  }
  for (const rev of [-1, 0.5, "4", Infinity, NaN, null]) {
    assert.equal(publicVisualPaletteRevision(rev), 0);
  }
});

test("UX-12: each approved accent can persist without changing alarm semantics", () => {
  for (const accent of VISUAL_PALETTE_ACCENTS) {
    const palette = {
      ...DEFAULT_STORED_VISUAL_PALETTE,
      cardBorder: accent,
      selectedCardBorder: accent,
      sectorSelection: accent,
      operationAccent: accent,
      focusAccent: accent,
    };
    assert.deepEqual(parseStoredVisualPalette(palette), palette);
  }
});
