/**
 * Call `oninview` the first time the element comes into the viewport.
 *
 *   <DriveListItem {drive} {@attach isLast && inView(loadMore)} />
 *
 * Once only: the list grows as this fires, and re-observing the same entry
 * would page again the moment it scrolled back past the threshold.
 *
 * Attached to the element that is actually being watched, so nothing has to be
 * wrapped in a box to hold a reference to it.
 *
 * @param {() => void} oninview
 * @returns {(node: Element) => () => void}
 */
export function inView(oninview) {
  return (node) => {
    let fired = false;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !fired) {
          fired = true;
          oninview();
        }
      }
    }, {
      root: null, // relative to the viewport
      rootMargin: '0px',
      threshold: 0.1, // 10% of the target's visibility
    });

    observer.observe(node);
    return () => observer.disconnect();
  };
}
