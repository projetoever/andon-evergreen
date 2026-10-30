import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import { getSystemSettings } from "@/services/systemSettingsService";
import {
  DEFAULT_VISUAL_PALETTE,
  parseVisualPalette,
  type VisualPaletteDraft,
} from "@/theme/andonVisualPalette";

const apiClient = createAndonApiClient();

export type GlobalVisualPaletteSnapshot = Readonly<{
  palette: VisualPaletteDraft;
  revision: number;
  canWrite: boolean;
}>;

export async function readGlobalVisualPalette(): Promise<GlobalVisualPaletteSnapshot> {
  const settings = await getSystemSettings();
  const palette = parseVisualPalette(settings.andonVisualPalette) ?? DEFAULT_VISUAL_PALETTE;
  const value = settings.andonVisualPaletteRevision;
  return {
    palette,
    revision: typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0,
    canWrite: CONFIGURED_DATA_MODE !== "local" && settings.andonVisualPaletteWriteEnabled === true,
  };
}

export async function saveGlobalVisualPalette(
  palette: VisualPaletteDraft,
  expectedRevision: number,
): Promise<GlobalVisualPaletteSnapshot> {
  if (CONFIGURED_DATA_MODE === "local")
    throw new Error("global_palette_requires_server");
  const validated = parseVisualPalette(palette);
  if (!validated || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    throw new Error("invalid_visual_palette");
  const result = await apiClient.patch<{
    palette: unknown; revision: number; changed: boolean;
  }>("/api/andon-visual-palette", { palette: validated, expectedRevision });
  const saved = parseVisualPalette(result.palette);
  if (!saved || !Number.isSafeInteger(result.revision) || result.revision < 0)
    throw new Error("invalid_visual_palette_response");
  return { palette: saved, revision: result.revision, canWrite: true };
}
