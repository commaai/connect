/**
 * Hold the page still behind a modal, and pad it by the scrollbar width so it
 * does not jump sideways when the scrollbar disappears.
 *
 * Refcounted. A modal opening on top of another does not lock again, and the
 * page is released only when the last one closes — which is what a plain
 * save-and-restore got wrong: whichever modal closed first put the page back
 * while the other was still up.
 *
 * Call it from an `$effect` and return the release:
 *
 *   $effect(() => {
 *     if (!isOpen) return;
 *     return lockBodyScroll();
 *   });
 *
 * @returns {() => void}
 */
export function lockBodyScroll() {
  depth += 1;

  if (depth === 1) {
    const { body } = document;
    restore = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };

    // only when the scrollbar is actually taking up room, which it is not on a
    // platform that overlays it
    if (body.clientWidth < window.innerWidth) {
      const padding = parseInt(window.getComputedStyle(body).paddingRight, 10) || 0;
      body.style.paddingRight = `${padding + scrollbarWidth()}px`;
    }
    body.style.overflow = 'hidden';
  }

  let released = false;
  return () => {
    // a double release would drop the count below the modals still holding it
    if (released) return;
    released = true;

    depth -= 1;
    if (depth === 0 && restore) {
      document.body.style.overflow = restore.overflow;
      document.body.style.paddingRight = restore.paddingRight;
      restore = null;
    }
  };
}

let depth = 0;
let restore = null;

/** Measured rather than assumed, because it is 0 wherever the scrollbar overlays. */
function scrollbarWidth() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:-9999px;width:50px;height:50px;overflow:scroll';
  document.body.appendChild(probe);
  const size = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return size;
}
