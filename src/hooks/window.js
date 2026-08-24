import { useEffect, useState } from 'react';

import { isIos } from '../utils/browser';

const RESIZE_DEBOUNCE = 150; // ms

export function getWindowSize() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

/** Debounced window size subscription. Returns unsubscribe. Does not fire initially. */
export function subscribeWindowSize(listener) {
  let resizeTimeout = null;

  const handleResize = () => {
    if (resizeTimeout) {
      window.clearTimeout(resizeTimeout);
    }

    resizeTimeout = window.setTimeout(() => {
      listener(getWindowSize());
      resizeTimeout = null;
    }, RESIZE_DEBOUNCE);
  };

  window.addEventListener('resize', handleResize);
  return () => {
    window.removeEventListener('resize', handleResize);
    if (resizeTimeout) {
      window.clearTimeout(resizeTimeout);
    }
  };
}

export const useWindowSize = () => {
  const [size, setSize] = useState(getWindowSize);

  useEffect(() => subscribeWindowSize(setSize), []);

  return size;
};

export const useWindowWidth = () => useWindowSize().width;

// Use the Screen Orientation API on iOS
export const getOrientationSource = () => (
  isIos() && window.screen?.orientation
    ? window.screen.orientation
    : window.matchMedia('(orientation: landscape)')
);

// ScreenOrientation exposes `type`/`angle`; MediaQueryList exposes `matches`
const computeIsLandscape = (source) => (
  'matches' in source ? source.matches : !!source.type?.startsWith('landscape')
);

export const useIsLandscape = () => {
  const [isLandscape, setIsLandscape] = useState(() => computeIsLandscape(getOrientationSource()));

  useEffect(() => {
    const source = getOrientationSource();
    const handler = () => setIsLandscape(computeIsLandscape(source));
    handler(); // resync in case the orientation changed before the listener attached
    source.addEventListener('change', handler);
    return () => source.removeEventListener('change', handler);
  }, []);

  return isLandscape;
};
