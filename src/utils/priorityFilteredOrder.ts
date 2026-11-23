/**
 * Reorder only visible machine slots. Hidden machines keep their exact
 * absolute positions, making filtered reordering deterministic and lossless.
 */
export function reorderVisiblePriorityIds(
  allIds: readonly string[],
  visibleIds: readonly string[],
  sourceId: string,
  targetId: string,
): string[] {
  if (sourceId === targetId || new Set(allIds).size !== allIds.length ||
      new Set(visibleIds).size !== visibleIds.length) return [...allIds];
  const allSet = new Set(allIds);
  if (visibleIds.some((id) => !allSet.has(id))) return [...allIds];
  const visibleSet = new Set(visibleIds);
  const canonicalVisible = allIds.filter((id) => visibleSet.has(id));
  if (!visibleSet.has(sourceId) || !visibleSet.has(targetId)) return [...allIds];
  const reordered = [...canonicalVisible];
  const source = reordered.indexOf(sourceId);
  const target = reordered.indexOf(targetId);
  const [moved] = reordered.splice(source, 1);
  reordered.splice(target, 0, moved);
  let nextVisibleIndex = 0;
  return allIds.map((id) =>
    visibleSet.has(id) ? reordered[nextVisibleIndex++] : id,
  );
}
