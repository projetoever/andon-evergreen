/** A sector's operational eligibility is independent of its direct button.
 * True-by-default maintains presentation of all pre-migration categories.
 * Group reason options depend on active only, never this display preference.
 */
export function isDirectSectorButtonEnabled(
  sector: { active: boolean; showDirectButton?: boolean },
): boolean {
  return sector.active && sector.showDirectButton !== false;
}
