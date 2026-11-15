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
  | "priorityBorder"
  | "dashboardBackground"
  | "machineSurface"
  | "failureSurface"
  | "prioritySurface";

export type VisualPaletteDraft = Readonly<{
  version: 1;
  cardBorder: VisualAccent;
  selectedCardBorder: VisualAccent;
  sectorSelection: VisualAccent;
  operationAccent: VisualAccent;
  focusAccent: VisualAccent;
  priorityBorder: VisualAccent;
  dashboardBackground: VisualAccent;
  machineSurface: VisualAccent;
  failureSurface: VisualAccent;
  prioritySurface: VisualAccent;
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
  "dashboardBackground", "machineSurface", "failureSurface", "prioritySurface",
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
  dashboardBackground: "#142330",
  machineSurface: "#273847",
  failureSurface: "#952B28",
  prioritySurface: "#293641",
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
  // Additive v1 compatibility: historical five/six accents remain valid.
  // The four presentation-only surface keys are optional but strictly checked.
  const optional = new Set<VisualPaletteKey>([
    "priorityBorder", "dashboardBackground", "machineSurface", "failureSurface", "prioritySurface",
  ]);
  if (!keys.includes("version") || body.version !== 1 ||
    keys.some(key => key !== "version" && !VISUAL_PALETTE_KEYS.includes(key as VisualPaletteKey)) ||
    VISUAL_PALETTE_KEYS.some(key =>
      optional.has(key) ? body[key] !== undefined && !isVisualAccent(body[key])
        : !isVisualAccent(body[key]))) return null;
  return Object.freeze({
    version: 1,
    cardBorder: body.cardBorder as VisualAccent,
    selectedCardBorder: body.selectedCardBorder as VisualAccent,
    sectorSelection: body.sectorSelection as VisualAccent,
    operationAccent: body.operationAccent as VisualAccent,
    focusAccent: body.focusAccent as VisualAccent,
    priorityBorder: (body.priorityBorder ?? DEFAULT_VISUAL_PALETTE.priorityBorder) as VisualAccent,
    dashboardBackground: (body.dashboardBackground ?? DEFAULT_VISUAL_PALETTE.dashboardBackground) as VisualAccent,
    machineSurface: (body.machineSurface ?? DEFAULT_VISUAL_PALETTE.machineSurface) as VisualAccent,
    failureSurface: (body.failureSurface ?? DEFAULT_VISUAL_PALETTE.failureSurface) as VisualAccent,
    prioritySurface: (body.prioritySurface ?? DEFAULT_VISUAL_PALETTE.prioritySurface) as VisualAccent,
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
      sectorSelection: "#E2E8F0", operationAccent: "#FFFFFF", focusAccent: "#FDE047", priorityBorder: "#FDE047",
      dashboardBackground: "#0A1220", machineSurface: "#121C2C",
      failureSurface: "#DC2626", prioritySurface: "#302D16" },
  },
  {
    id: "contrastLight", label: "Alto Contraste Claro",
    description: "Contornos escuros e foco forte para telas claras.",
    palette: { ...DEFAULT_VISUAL_PALETTE, cardBorder: "#334155", selectedCardBorder: "#111827",
      sectorSelection: "#1D4ED8", operationAccent: "#1D4ED8", focusAccent: "#111827", priorityBorder: "#7C2D12",
      dashboardBackground: "#E9EDF5", machineSurface: "#F9FAFB",
      failureSurface: "#BE123C", prioritySurface: "#FFEDD5" },
  },
  {
    id: "industrialBlue", label: "Industrial Azul/Aço",
    description: "Azul técnico e aço, para ambientes industriais.",
    palette: { ...DEFAULT_VISUAL_PALETTE, cardBorder: "#526578", selectedCardBorder: "#55B6EF",
      sectorSelection: "#55B6EF", operationAccent: "#55B6EF", focusAccent: "#A0A5FF", priorityBorder: "#FFB454",
      dashboardBackground: "#092D4D", machineSurface: "#123C59",
      failureSurface: "#FF6B35", prioritySurface: "#244A65" },
  },
  {
    id: "warm", label: "Quente Operacional",
    description: "Âmbar e cobre para realces não críticos.",
    palette: { ...DEFAULT_VISUAL_PALETTE, cardBorder: "#8F6C58", selectedCardBorder: "#D97706",
      sectorSelection: "#D97706", operationAccent: "#C2410C", focusAccent: "#EAB308", priorityBorder: "#EA580C",
      dashboardBackground: "#492712", machineSurface: "#604024",
      failureSurface: "#DC2626", prioritySurface: "#6B3A1D" },
  },
  {
    id: "neutral", label: "Tech Neutro",
    description: "Cinzas frios, ciano moderado e leitura limpa.",
    palette: { ...DEFAULT_VISUAL_PALETTE, cardBorder: "#64748B", selectedCardBorder: "#94A3B8",
      sectorSelection: "#38BDF8", operationAccent: "#38BDF8", focusAccent: "#94A3B8", priorityBorder: "#0EA5E9",
      dashboardBackground: "#1B3440", machineSurface: "#27424E",
      failureSurface: "#BE123C", prioritySurface: "#284656" },
  },
] satisfies ReadonlyArray<{
  id: string; label: string; description: string; palette: VisualPaletteDraft;
}>);

/**
 * Surface hue may be customized, but screen readability is protected:
 * dark surfaces remain dark and light surfaces remain light, irrespective
 * of a user's chosen RGB. This does not modify semantic failure/warning text.
 */
export function presentationSurfaceForTheme(
  accent: VisualAccent,
  theme: "light" | "dark",
  surface: "dashboard" | "machine",
): string {
  const hex = accentForTheme(accent, theme);
  const rgb = [1, 3, 5].map(pos => parseInt(hex.slice(pos, pos + 2), 16) / 255);
  const max = Math.max(...rgb), min = Math.min(...rgb);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    const idx = rgb.indexOf(max);
    hue = idx === 0 ? ((rgb[1] - rgb[2]) / delta) % 6 :
      idx === 1 ? (rgb[2] - rgb[0]) / delta + 2 :
      (rgb[0] - rgb[1]) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const lightness = theme === "dark"
    ? (surface === "dashboard" ? 0.135 : 0.21)
    : (surface === "dashboard" ? 0.955 : 0.982);
  const saturation = delta < 0.02 ? 0.04 : 0.45;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = lightness - chroma / 2;
  const components = hue < 60 ? [chroma, x, 0] :
    hue < 120 ? [x, chroma, 0] :
    hue < 180 ? [0, chroma, x] :
    hue < 240 ? [0, x, chroma] :
    hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return "#" + components.map(v =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

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
