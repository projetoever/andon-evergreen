import type { AndonCall } from "../types/andon";
import type { AndonCategoryConfig } from "../types/settings";

export interface MachineSectorTile {
  category: AndonCategoryConfig;
  activeCall: AndonCall | undefined;
  /** Exceptional visibility exists ONLY while a machine's call is active. */
  temporarilyVisible: boolean;
}

const ACTIVE = new Set(["open", "in_progress", "post_maintenance"]);

/**
 * REFINE23: reconcile the machine's configured direct buttons with live calls.
 * Pure and idempotent: does not write visibility, group links, or call metadata.
 *
 * The full category catalog supplies canonical name/color even when a sector
 * is not in the machine's normally visible list. Never consult a mutable
 * group link to keep a call visible: that link may be removed mid-attendance.
 */
export function deriveMachineSectorTiles(
  visibleCategories: readonly AndonCategoryConfig[],
  categoryCatalog: readonly AndonCategoryConfig[],
  machineActiveCalls: readonly AndonCall[],
): MachineSectorTile[] {
  const activeBySubtype = new Map<string, AndonCall>();
  for (const call of machineActiveCalls) {
    if (call.isSystemTest || !ACTIVE.has(call.status)) continue;
    if (!activeBySubtype.has(call.subtype)) activeBySubtype.set(call.subtype, call);
  }

  const known = new Set<string>();
  const tiles: MachineSectorTile[] = [];
  for (const category of visibleCategories) {
    if (known.has(category.id)) continue;
    known.add(category.id);
    tiles.push({
      category,
      activeCall: activeBySubtype.get(category.id),
      temporarilyVisible: false,
    });
  }

  const catalogById = new Map(categoryCatalog.map(category => [category.id, category]));
  for (const [subtype, activeCall] of activeBySubtype) {
    if (known.has(subtype)) continue;
    const category = catalogById.get(subtype);
    if (!category) continue; // Cannot fabricate sector identity or original color.
    known.add(subtype);
    tiles.push({ category, activeCall, temporarilyVisible: true });
  }
  return tiles;
}
