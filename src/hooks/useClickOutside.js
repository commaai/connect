import { useEffect } from 'react';

// Calls `onOutside` when a mousedown lands outside `ref`. Only active while
// `enabled` is true, so the listener isn't attached when the popover is closed.
export const useClickOutside = (ref, enabled, onOutside) => {
  useEffect(() => {
    if (!enabled) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, enabled, onOutside]);
};
