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
  | "focusAccent"
  | "priorityBorder";

export type VisualPaletteDraft = Readonly<{
  version: 1;
  cardBorder: VisualAccent;
  selectedCardBorder: VisualAccent;
  sectorSelection: VisualAccent;
  operationAccent: VisualAccent;
  focusAccent: VisualAccent;
  priorityBorder: VisualAccent;
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
  "operationAccent", "focusAccent", "priorityBorder",
]);

export const DEFAULT_VISUAL_PALETTE: VisualPaletteDraft = Object.freeze({
  version: 1,
  cardBorder: "slate",
  selectedCardBorder: "evergreen",
  sectorSelection: "evergreen",
  operationAccent: "evergreen",
  focusAccent: "evergreen",
  // The existing orange priority group outline remains unchanged until configured.
  priorityBorder: "#F97316",
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
  // Additive compatibility with the previously persisted five-token schema:
  // old databases remain valid; only priorityBorder may be absent.
  if ((keys.length !== VISUAL_PALETTE_KEYS.length + 1 &&
       keys.length !== VISUAL_PALETTE_KEYS.length) ||
    keys.some(key => key !== "version" && !VISUAL_PALETTE_KEYS.includes(key as VisualPaletteKey)) ||
    body.version !== 1 ||
    VISUAL_PALETTE_KEYS.some(key =>
      key !== "priorityBorder" && !isVisualAccent(body[key])) ||
    (body.priorityBorder !== undefined && !isVisualAccent(body.priorityBorder))) return null;
  return Object.freeze({
    version: 1,
    cardBorder: body.cardBorder as VisualAccent,
    selectedCardBorder: body.selectedCardBorder as VisualAccent,
    sectorSelection: body.sectorSelection as VisualAccent,
    operationAccent: body.operationAccent as VisualAccent,
    focusAccent: body.focusAccent as VisualAccent,
    priorityBorder: (body.priorityBorder ?? DEFAULT_VISUAL_PALETTE.priorityBorder) as VisualAccent,
  });
}

export function accentForTheme(accent: VisualAccent, theme: "light" | "dark"): string {
  if (isCustomVisualHex(accent)) return accent.toUpperCase();
  return VISUAL_ACCENTS[accent][theme];
}

export function restoreDefaultVisualPalette(): VisualPaletteDraft {
  return { ...DEFAULT_VISUAL_PALETTE };
}

/** Named, optional accent packs. They never change alarm/status semantics.
 * Light/dark UI theme remains the workstation's independent preference.
 */
export const INDUSTRIAL_VISUAL_PRESETS = Object.freeze([
  {
    id: "evergreen", label: "Evergreen Industrial",
    description: "Identidade verde com contornos equilibrados.",
    palette: { ...DEFAULT_VISUAL_PALETTE },
  },
  {
    id: "contrastDark", label: "Alto Contraste Escuro",
    description: "Realces claros para telas escuras e leitura à distância.",
    palette: { ...DEFAULT_VISUAL_PALETTE, cardBorder: "#E2E8F0", selectedCardBorder: "#FFFFFF",
      sectorSelection: "#E2E8F0", operationAccent: "#FFFFFF", focusAccent: "#FDE047", priorityBorder: "#FDE047" },
  },
  {
    id: "contrastLight", label: "Alto Contraste Claro",
    description: "Contornos escuros e foco forte para telas claras.",
    palette: { ...DEFAULT_VISUAL_PALETTE, cardBorder: "#334155", selectedCardBorder: "#111827",
      sectorSelection: "#1D4ED8", operationAccent: "#1D4ED8", focusAccent: "#111827", priorityBorder: "#7C2D12" },
  },
  {
    id: "industrialBlue", label: "Industrial Azul/Aço",
    description: "Azul técnico e aço, para ambientes industriais.",
    palette: { ...DEFAULT_VISUAL_PALETTE, cardBorder: "#526578", selectedCardBorder: "#55B6EF",
      sectorSelection: "#55B6EF", operationAccent: "#55B6EF", focusAccent: "#A0A5FF", priorityBorder: "#FFB454" },
  },
  {
    id: "warm", label: "Quente Operacional",
    description: "Âmbar e cobre para realces não críticos.",
    palette: { ...DEFAULT_VISUAL_PALETTE, cardBorder: "#8F6C58", selectedCardBorder: "#D97706",
      sectorSelection: "#D97706", operationAccent: "#C2410C", focusAccent: "#EAB308", priorityBorder: "#EA580C" },
  },
  {
    id: "neutral", label: "Tech Neutro",
    description: "Cinzas frios, ciano moderado e leitura limpa.",
    palette: { ...DEFAULT_VISUAL_PALETTE, cardBorder: "#64748B", selectedCardBorder: "#94A3B8",
      sectorSelection: "#38BDF8", operationAccent: "#38BDF8", focusAccent: "#94A3B8", priorityBorder: "#0EA5E9" },
  },
] satisfies ReadonlyArray<{
  id: string; label: string; description: string; palette: VisualPaletteDraft;
}>);

/** Relative WCAG luminance / contrast, for advisory outline visibility. */
export function paletteContrastRatio(hexA: string, hexB: string): number {
  const luminance = (hex: string) => {
    if (!isCustomVisualHex(hex)) return 0;
    const channels = [1, 3, 5].map(pos => parseInt(hex.slice(pos, pos + 2), 16) / 255);
    const [red, green, blue] = channels.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const a = luminance(hexA), b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
