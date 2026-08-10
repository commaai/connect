/**
 * Stop a touch on this element from reaching anything above it.
 *
 *   <div {@attach keepTouch()}>
 *
 * Has to be a native listener on the element itself. Svelte delegates
 * `ontouchstart` to the root, so a handler written that way only runs after the
 * event has already passed every ancestor — too late to stop the listeners the
 * drawer and mapbox install on theirs, which is what otherwise steals a drag
 * that started on a timeline ruler or inside a map.
 *
 * @returns {(node: Element) => () => void}
 */
export function keepTouch() {
  return (node) => {
    const stop = (event) => event.stopPropagation();

    node.addEventListener('touchstart', stop);
    return () => node.removeEventListener('touchstart', stop);
  };
}
