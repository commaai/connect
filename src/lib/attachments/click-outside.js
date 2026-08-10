/**
 * Close something when a pointer goes down anywhere outside it.
 *
 *   <div {@attach open && clickOutside(close)}>
 *
 * A falsy expression is a no-op attachment, so gating it on the open flag is
 * what keeps the listener off the document the rest of the time — and the
 * teardown comes with the element rather than being written out by hand.
 *
 * `pointerdown` rather than `mousedown`: a touch produces no mouse event until
 * it resolves into a click, so a menu on a touchscreen stayed open under the
 * finger trying to dismiss it.
 *
 * @param {() => void} close
 * @returns {(node: Element) => () => void}
 */
export function clickOutside(close) {
  return (node) => {
    const onPointerDown = (event) => {
      if (!node.contains(event.target)) close();
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  };
}
