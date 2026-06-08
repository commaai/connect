import { useEffect, useRef, useState } from 'react';

import { isIos } from '../utils/browser';

const RESIZE_DEBOUNCE = 150; // ms

export const useWindowWidth = () => {
  const [width, setWidth] = useState(window.innerWidth);
  const resizeTimeout = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      if (resizeTimeout.current) {
        window.clearTimeout(resizeTimeout.current);
      }

      resizeTimeout.current = window.setTimeout(() => {
        setWidth(window.innerWidth);
        resizeTimeout.current = null;
      }, RESIZE_DEBOUNCE);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout.current) {
        window.clearTimeout(resizeTimeout.current);
      }
    };
  }, []);

  return width;
};

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
