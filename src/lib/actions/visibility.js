/**
 * Port of the React VisibilityHandler component, which rendered nothing and
 * existed only for its lifecycle hooks. Call it from an $effect and return the
 * result, which unsubscribes:
 *
 *   $effect(() => watchVisibility({ onVisible: refresh, minInterval: 60 }));
 *
 * @param {object} options
 * @param {() => void} options.onVisible
 * @param {number} [options.minInterval] seconds that must pass between calls
 * @param {number} [options.onInterval] seconds between polls, 0 to not poll
 * @param {boolean} [options.onInit] call onVisible immediately
 * @param {boolean} [options.resetOnHidden] restart minInterval when hidden
 * @returns {() => void}
 */
export function watchVisibility({
  onVisible,
  minInterval = 0,
  onInterval = 0,
  onInit = false,
  resetOnHidden = false,
}) {
  let prevVisibleCall = Date.now() / 1000;

  const onVisibilityEvent = (visible) => {
    const now = Date.now() / 1000;
    const dt = now - prevVisibleCall;
    if (visible && (!minInterval || dt > minInterval)) {
      prevVisibleCall = now;
      onVisible();
    }

    if (!visible && resetOnHidden) {
      prevVisibleCall = now;
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      onVisibilityEvent(true);
    } else if (document.visibilityState === 'hidden') {
      onVisibilityEvent(false);
    }
  };
  const handleFocus = () => onVisibilityEvent(true);
  const handleBlur = () => onVisibilityEvent(false);

  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('focus', handleFocus);
  document.addEventListener('blur', handleBlur);

  if (onInit) {
    onVisible();
  }

  const intervalHandle = onInterval ? setInterval(handleVisibilityChange, onInterval * 1000) : null;

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('focus', handleFocus);
    document.removeEventListener('blur', handleBlur);
    if (intervalHandle) {
      clearInterval(intervalHandle);
    }
  };
}
