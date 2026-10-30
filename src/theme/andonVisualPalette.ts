/**
 * UX-12 / stage 1: PREVIEW ONLY. This module cannot write production settings.
 * Non-critical accents are selected from a small, vetted set; alarm danger/
 * warning colors and their UI states remain exclusively in semantic CSS.
 */
export type VisualAccent = "evergreen" | "ocean" | "indigo" | "violet";
export type VisualPaletteKey =
  | "cardBorder"
  | "selectedCardBorder"
  | "sectorSelection"
  | "operationAccent"
  | "focusAccent";

export type VisualPaletteDraft = Readonly<{
  version: 1;
  cardBorder: VisualAccent;
  selectedCardBorder: VisualAccent;
  sectorSelection: VisualAccent;
  operationAccent: VisualAccent;
  focusAccent: VisualAccent;
}>;

export const VISUAL_ACCENTS: Readonly<Record<VisualAccent, Readonly<{
  dark: string;
  light: string;
}>>> = Object.freeze({
  evergreen: Object.freeze({ dark: "#35BE79", light: "#16794A" }),
  ocean: Object.freeze({ dark: "#55B6EF", light: "#12668F" }),
  indigo: Object.freeze({ dark: "#A0A5FF", light: "#4347A7" }),
  violet: Object.freeze({ dark: "#C69BF5", light: "#7837A6" }),
});

export const VISUAL_PALETTE_KEYS: readonly VisualPaletteKey[] = Object.freeze([
  "cardBorder", "selectedCardBorder", "sectorSelection",
  "operationAccent", "focusAccent",
]);

export const DEFAULT_VISUAL_PALETTE: VisualPaletteDraft = Object.freeze({
  version: 1,
  cardBorder: "evergreen",
  selectedCardBorder: "evergreen",
  sectorSelection: "evergreen",
  operationAccent: "evergreen",
  focusAccent: "evergreen",
});

export function isVisualAccent(value: unknown): value is VisualAccent {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(VISUAL_ACCENTS, value);
}

/** Fail-closed parsing: no free-form CSS/hex, reserved keys or status colors. */
export function parseVisualPalette(input: unknown): VisualPaletteDraft | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== VISUAL_PALETTE_KEYS.length + 1 ||
    keys.some(key => key !== "version" && !VISUAL_PALETTE_KEYS.includes(key as VisualPaletteKey)) ||
    body.version !== 1 ||
    VISUAL_PALETTE_KEYS.some(key => !isVisualAccent(body[key]))) return null;
  return Object.freeze({
    version: 1,
    cardBorder: body.cardBorder as VisualAccent,
    selectedCardBorder: body.selectedCardBorder as VisualAccent,
    sectorSelection: body.sectorSelection as VisualAccent,
    operationAccent: body.operationAccent as VisualAccent,
    focusAccent: body.focusAccent as VisualAccent,
  });
}

export function accentForTheme(accent: VisualAccent, theme: "light" | "dark"): string {
  return VISUAL_ACCENTS[accent][theme];
}

export function restoreDefaultVisualPalette(): VisualPaletteDraft {
  return { ...DEFAULT_VISUAL_PALETTE };
}
