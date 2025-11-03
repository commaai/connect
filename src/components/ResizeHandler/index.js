import { useEffect, useRef } from 'react';

const ResizeHandler = (props) => {
  const { onResize } = props;
  const resizeTimeoutRef = useRef(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: onResize is passed as prop and may change, but we want to use latest version without re-subscribing
  useEffect(() => {
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        window.clearTimeout(resizeTimeoutRef.current);
      }

      resizeTimeoutRef.current = window.setTimeout(() => {
        onResize(window.innerWidth, window.innerHeight);
        resizeTimeoutRef.current = null;
      }, 150);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeoutRef.current) {
        window.clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, []);

  return null;
};

export default ResizeHandler;
