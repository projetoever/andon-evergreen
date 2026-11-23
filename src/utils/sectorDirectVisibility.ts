/** A sector's operational eligibility is independent of its direct button.
 * True-by-default maintains presentation of all pre-migration categories.
 * Group reason options depend on active only, never this display preference.
 */
/** Local hide flags cannot make an inactive or globally hidden sector openable. */
export function isMachineDirectSectorButtonEnabled(
  sector: { id: string; active: boolean; showDirectButton?: boolean },
  hiddenDirectSectorIds: readonly string[] = [],
): boolean {
  return isDirectSectorButtonEnabled(sector) && !hiddenDirectSectorIds.includes(sector.id);
}

export function isDirectSectorButtonEnabled(
  sector: { active: boolean; showDirectButton?: boolean },
): boolean {
  return sector.active && sector.showDirectButton !== false;
}
