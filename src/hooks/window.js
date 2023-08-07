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
