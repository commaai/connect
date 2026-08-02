/**
 * Leading/trailing debounce (same API as the former `debounce` package).
 * When `immediate` is true, invoke on the leading edge.
 */
export default function debounce(func, wait = 100, immediate = false) {
  let timeout = null;
  let args;
  let context;
  let timestamp;
  let result;

  function later() {
    const last = Date.now() - timestamp;

    if (last < wait && last >= 0) {
      timeout = setTimeout(later, wait - last);
    } else {
      timeout = null;
      if (!immediate) {
        result = func.apply(context, args);
        context = args = null;
      }
    }
  }

  function debounced(...nextArgs) {
    context = this;
    args = nextArgs;
    timestamp = Date.now();
    const callNow = immediate && !timeout;
    if (!timeout) {
      timeout = setTimeout(later, wait);
    }
    if (callNow) {
      result = func.apply(context, args);
      context = args = null;
    }
    return result;
  }

  debounced.clear = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}
