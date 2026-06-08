import { useEffect, useRef, useState } from 'react';

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

export const getOrientationSource = () => window.screen?.orientation ?? window.matchMedia('(orientation: landscape)');

const isLandscapeFromScreen = (orientation) => orientation.type.startsWith('landscape');
const isLandscapeFromMedia = () => window.matchMedia('(orientation: landscape)').matches;

export const useIsLandscape = () => {
  const [isLandscape, setIsLandscape] = useState(isLandscapeFromMedia);

  useEffect(() => {
    const query = window.matchMedia('(orientation: landscape)');
    const orientation = window.screen?.orientation;

    const onMedia = () => setIsLandscape(isLandscapeFromMedia());
    const onOrientation = () => setIsLandscape(isLandscapeFromScreen(orientation));

    onMedia(); // resync in case the orientation changed before the listeners attached
    // Desktop window resizes only fire the media query; device rotations fire both
    query.addEventListener('change', onMedia);
    orientation?.addEventListener('change', onOrientation);
    return () => {
      query.removeEventListener('change', onMedia);
      orientation?.removeEventListener('change', onOrientation);
    };
  }, []);

  return isLandscape;
};
