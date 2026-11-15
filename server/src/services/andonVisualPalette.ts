/**
 * UX-12 storage boundary: strict legacy accents or #RRGGBB colors only.
 * Critical alarm/warning status tokens never belong to this whitelist.
 * Revision, access checks and audit remain in centralVisualPalette.
 */
export const VISUAL_PALETTE_ACCENTS = [
  "slate", "evergreen", "ocean", "indigo", "violet",
] as const;
export type VisualPaletteAccent = typeof VISUAL_PALETTE_ACCENTS[number] | `#${string}`;
export const VISUAL_PALETTE_FIELDS = [
  "cardBorder", "selectedCardBorder", "sectorSelection",
  "operationAccent", "focusAccent", "priorityBorder",
  "dashboardBackground", "machineSurface", "failureSurface", "prioritySurface",
] as const;
export type VisualPaletteField = typeof VISUAL_PALETTE_FIELDS[number];

export type StoredVisualPalette = Readonly<{
  version: 1;
  cardBorder: VisualPaletteAccent;
  selectedCardBorder: VisualPaletteAccent;
  sectorSelection: VisualPaletteAccent;
  operationAccent: VisualPaletteAccent;
  focusAccent: VisualPaletteAccent;
  priorityBorder: VisualPaletteAccent;
  dashboardBackground: VisualPaletteAccent;
  machineSurface: VisualPaletteAccent;
  failureSurface: VisualPaletteAccent;
  prioritySurface: VisualPaletteAccent;
}>;

/** Never change in place; newly deployed systems and existing kiosks share it. */
export const DEFAULT_STORED_VISUAL_PALETTE: StoredVisualPalette = Object.freeze({
  version: 1,
  cardBorder: "slate",
  selectedCardBorder: "evergreen",
  sectorSelection: "evergreen",
  operationAccent: "evergreen",
  focusAccent: "evergreen",
  priorityBorder: "#F97316",
  dashboardBackground: "#142330",
  machineSurface: "#273847",
  failureSurface: "#952B28",
  prioritySurface: "#293641",
});

const permitted = new Set<string>(VISUAL_PALETTE_ACCENTS);
const fields = new Set<string>(VISUAL_PALETTE_FIELDS);

function isValidAccent(value: unknown): value is VisualPaletteAccent {
  return typeof value === "string" && (
    permitted.has(value) || /^#[0-9a-fA-F]{6}$/.test(value)
  );
}

export function parseStoredVisualPalette(raw: unknown): StoredVisualPalette | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const names = Object.keys(input);
  // Historical five/six-token v1 palettes remain valid. New surface
  // tokens are optional, strictly #RRGGBB or the five named accents.
  const optional = new Set<VisualPaletteField>([
    "priorityBorder", "dashboardBackground", "machineSurface", "failureSurface", "prioritySurface",
  ]);
  if (!names.includes("version") || input.version !== 1 ||
      names.some(name => name !== "version" && !fields.has(name)) ||
      VISUAL_PALETTE_FIELDS.some(name =>
        optional.has(name) ? input[name] !== undefined && !isValidAccent(input[name])
          : !isValidAccent(input[name]))) return null;
  return {
    version: 1,
    cardBorder: input.cardBorder as VisualPaletteAccent,
    selectedCardBorder: input.selectedCardBorder as VisualPaletteAccent,
    sectorSelection: input.sectorSelection as VisualPaletteAccent,
    operationAccent: input.operationAccent as VisualPaletteAccent,
    focusAccent: input.focusAccent as VisualPaletteAccent,
    priorityBorder: (input.priorityBorder ?? DEFAULT_STORED_VISUAL_PALETTE.priorityBorder) as VisualPaletteAccent,
    dashboardBackground: (input.dashboardBackground ?? DEFAULT_STORED_VISUAL_PALETTE.dashboardBackground) as VisualPaletteAccent,
    machineSurface: (input.machineSurface ?? DEFAULT_STORED_VISUAL_PALETTE.machineSurface) as VisualPaletteAccent,
    failureSurface: (input.failureSurface ?? DEFAULT_STORED_VISUAL_PALETTE.failureSurface) as VisualPaletteAccent,
    prioritySurface: (input.prioritySurface ?? DEFAULT_STORED_VISUAL_PALETTE.prioritySurface) as VisualPaletteAccent,
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
