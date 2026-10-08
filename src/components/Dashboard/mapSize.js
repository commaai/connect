const MAP_COLLAPSE_SCROLL_DISTANCE = 240;

export function getDashboardMapHeight(viewportHeight, scrollY) {
  const expandedHeight = viewportHeight * 0.5;
  const collapsedHeight = viewportHeight * 0.2;
  const progress = Math.min(Math.max(scrollY / MAP_COLLAPSE_SCROLL_DISTANCE, 0), 1);
  const easedProgress = progress * progress * (3 - (2 * progress));
  return expandedHeight - ((expandedHeight - collapsedHeight) * easedProgress);
}
