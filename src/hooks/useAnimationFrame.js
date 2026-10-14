import { useEffect, useLayoutEffect, useRef } from 'react';

// Each subscriber reads current props without restarting its frame loop on renders.
export function useLatest(value) {
  const latest = useRef(value);
  useLayoutEffect(() => { latest.current = value; });
  return latest;
}

export default function useAnimationFrame(callback) {
  const latest = useLatest(callback);
  useEffect(() => {
    let frame;
    const tick = () => {
      latest.current();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
}
