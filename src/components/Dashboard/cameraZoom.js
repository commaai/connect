// Zoom the capture track so both the preview and QR detector receive zoomed frames.
export default function attachCameraZoom(element, track, isActive) {
  const zoom = track?.getCapabilities?.().zoom;
  if (!element || !zoom || zoom.max <= zoom.min) return () => {};

  let target = track.getSettings().zoom ?? zoom.min;
  let applied = target;
  let pinch = null;
  let applying = false;
  let disposed = false;
  const previousTouchAction = element.style.touchAction;
  element.style.touchAction = 'none';

  const apply = async () => {
    if (applying || disposed) return;
    applying = true;
    try {
      while (!disposed && isActive() && target !== applied) {
        const value = target;
        const constraints = track.getConstraints();
        // Apply zoom sequentially so older updates cannot overwrite newer ones.
        // eslint-disable-next-line no-await-in-loop
        await track.applyConstraints({
          ...constraints,
          advanced: [...(constraints.advanced || []).map(({ zoom: oldZoom, ...rest }) => rest), { zoom: value }],
        });
        applied = value;
      }
    } catch {
      // A rejected zoom must not interrupt QR scanning
      target = track.getSettings().zoom ?? applied;
      applied = target;
      pinch = null;
    } finally {
      applying = false;
    }
  };

  const distance = (touches) => Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );
  const start = (event) => {
    pinch = null;
    if (!isActive() || event.touches.length !== 2) return;
    event.preventDefault();
    const initialDistance = distance(event.touches);
    if (initialDistance > 0) pinch = { distance: initialDistance, zoom: target };
  };
  const move = (event) => {
    if (!isActive() || event.touches.length !== 2) {
      pinch = null;
      return;
    }
    if (!pinch) return;
    event.preventDefault();
    const value = pinch.zoom * distance(event.touches) / pinch.distance;
    const step = zoom.step > 0 ? zoom.step : 0;
    const rounded = step ? zoom.min + Math.round((value - zoom.min) / step) * step : value;
    target = Math.max(zoom.min, Math.min(zoom.max, rounded));
    apply();
  };
  const end = () => { pinch = null; };
  element.addEventListener('touchstart', start, { passive: false });
  element.addEventListener('touchmove', move, { passive: false });
  element.addEventListener('touchend', end);
  element.addEventListener('touchcancel', end);

  return () => {
    disposed = true;
    pinch = null;
    element.style.touchAction = previousTouchAction;
    element.removeEventListener('touchstart', start);
    element.removeEventListener('touchmove', move);
    element.removeEventListener('touchend', end);
    element.removeEventListener('touchcancel', end);
  };
}
