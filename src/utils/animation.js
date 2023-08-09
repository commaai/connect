import { useCallback, useEffect, useRef } from 'react';

export const useAnimationFrame = (handler) => {
  const frame = useRef(0);

  const animate = useCallback(() => {
    handler();
    frame.current = requestAnimationFrame(animate);
  }, [handler]);

  useEffect(() => {
    frame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame.current);
  }, [animate]);
};
