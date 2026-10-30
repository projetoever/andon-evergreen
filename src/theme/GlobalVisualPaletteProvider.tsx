import {
  useCallback, useEffect, useRef, useState, type ReactNode,
} from "react";
import { readGlobalVisualPalette } from "@/services/visualPaletteService";
import {
  accentForTheme,
  DEFAULT_VISUAL_PALETTE,
  VISUAL_PALETTE_KEYS,
  type VisualPaletteDraft,
} from "@/theme/andonVisualPalette";
import { useTheme } from "@/theme/ThemeProvider";

export const VISUAL_PALETTE_POLL_MS = 30_000;
const VARIABLES = {
  cardBorder: "--andon-palette-card-border",
  selectedCardBorder: "--andon-palette-selected-card-border",
  sectorSelection: "--andon-palette-sector-selection",
  operationAccent: "--andon-palette-operation-accent",
  focusAccent: "--andon-palette-focus-accent",
} as const;

/**
 * All approved workstations read the same server revision. Local light/dark
 * only affects shade, not globally selected accent or protected alarm colors.
 */
export function GlobalVisualPaletteProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [current, setCurrent] = useState<{
    palette: VisualPaletteDraft; revision: number;
  }>({ palette: DEFAULT_VISUAL_PALETTE, revision: 0 });
  const active = useRef(false);

  const refresh = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    try {
      const latest = await readGlobalVisualPalette();
      setCurrent(old => {
        if (old.revision === latest.revision &&
            JSON.stringify(old.palette) === JSON.stringify(latest.palette)) return old;
        return { palette: latest.palette, revision: latest.revision };
      });
    } catch {
      // Never invent or cache unverified server settings. Retain the last
      // validated palette, or the safe industrial default on first load.
    } finally {
      active.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), VISUAL_PALETTE_POLL_MS);
    const onChange = () => void refresh();
    window.addEventListener("andon:global-palette-changed", onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("andon:global-palette-changed", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [refresh]);

  useEffect(() => {
    const root = document.documentElement;
    for (const key of VISUAL_PALETTE_KEYS)
      root.style.setProperty(VARIABLES[key], accentForTheme(current.palette[key], theme));
    return () => {
      for (const key of VISUAL_PALETTE_KEYS)
        root.style.removeProperty(VARIABLES[key]);
    };
  }, [current.palette, theme]);

  return <>{children}</>;
}
