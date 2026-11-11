/**
 * Global ANDON visual accents: legacy named presets or user-chosen RGB/HEX.
 * Only strict #RRGGBB values are accepted; critical stop/warning tokens stay
 * outside this schema and always retain their semantic CSS colors.
 */
export type PresetVisualAccent = "slate" | "evergreen" | "ocean" | "indigo" | "violet";
export type VisualAccent = PresetVisualAccent | `#${string}`;
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

export const VISUAL_ACCENTS: Readonly<Record<PresetVisualAccent, Readonly<{
  dark: string;
  light: string;
}>>> = Object.freeze({
  slate: Object.freeze({ dark: "#526578", light: "#CBD5E1" }),
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
  cardBorder: "slate",
  selectedCardBorder: "evergreen",
  sectorSelection: "evergreen",
  operationAccent: "evergreen",
  focusAccent: "evergreen",
});

export function isCustomVisualHex(value: unknown): value is `#${string}` {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function isVisualAccent(value: unknown): value is VisualAccent {
  return isCustomVisualHex(value) || (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(VISUAL_ACCENTS, value)
  );
}

/** Fail-closed parsing: legacy names or strict RGB hex only; never CSS/status fields. */
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
  if (isCustomVisualHex(accent)) return accent.toUpperCase();
  return VISUAL_ACCENTS[accent][theme];
}

export function restoreDefaultVisualPalette(): VisualPaletteDraft {
  return { ...DEFAULT_VISUAL_PALETTE };
}
