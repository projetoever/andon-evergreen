/**
 * UX-12 storage boundary: STRICT non-critical token palette, never CSS.
 * Keep allowed names and default values in sync with the UI palette schema.
 * The write endpoint and audit trail are deliberately outside this stage.
 */
export const VISUAL_PALETTE_ACCENTS = [
  "slate", "evergreen", "ocean", "indigo", "violet",
] as const;
export type VisualPaletteAccent = typeof VISUAL_PALETTE_ACCENTS[number];
export const VISUAL_PALETTE_FIELDS = [
  "cardBorder", "selectedCardBorder", "sectorSelection",
  "operationAccent", "focusAccent",
] as const;
export type VisualPaletteField = typeof VISUAL_PALETTE_FIELDS[number];

export type StoredVisualPalette = Readonly<{
  version: 1;
  cardBorder: VisualPaletteAccent;
  selectedCardBorder: VisualPaletteAccent;
  sectorSelection: VisualPaletteAccent;
  operationAccent: VisualPaletteAccent;
  focusAccent: VisualPaletteAccent;
}>;

/** Never change in place; newly deployed systems and existing kiosks share it. */
export const DEFAULT_STORED_VISUAL_PALETTE: StoredVisualPalette = Object.freeze({
  version: 1,
  cardBorder: "slate",
  selectedCardBorder: "evergreen",
  sectorSelection: "evergreen",
  operationAccent: "evergreen",
  focusAccent: "evergreen",
});

const permitted = new Set<string>(VISUAL_PALETTE_ACCENTS);
const fields = new Set<string>(VISUAL_PALETTE_FIELDS);

export function parseStoredVisualPalette(raw: unknown): StoredVisualPalette | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const names = Object.keys(input);
  if (names.length !== VISUAL_PALETTE_FIELDS.length + 1 ||
      !names.includes("version") || input.version !== 1 ||
      names.some(name => name !== "version" && !fields.has(name)) ||
      VISUAL_PALETTE_FIELDS.some(name => typeof input[name] !== "string" ||
        !permitted.has(input[name] as string))) return null;
  return {
    version: 1,
    cardBorder: input.cardBorder as VisualPaletteAccent,
    selectedCardBorder: input.selectedCardBorder as VisualPaletteAccent,
    sectorSelection: input.sectorSelection as VisualPaletteAccent,
    operationAccent: input.operationAccent as VisualPaletteAccent,
    focusAccent: input.focusAccent as VisualPaletteAccent,
  };
}

/** Malformed or old storage must never inject arbitrary CSS into any client. */
export function publicVisualPalette(raw: unknown): StoredVisualPalette {
  return parseStoredVisualPalette(raw) ?? DEFAULT_STORED_VISUAL_PALETTE;
}

export function publicVisualPaletteRevision(revision: unknown): number {
  return typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0
    ? revision : 0;
}
