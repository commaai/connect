import { useEffect, useRef } from 'react';

const MAX_SCALE = 4;

const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const midpoint = (a, b, rect) => ({
  x: (a.clientX + b.clientX) / 2 - rect.left,
  y: (a.clientY + b.clientY) / 2 - rect.top,
});

//`containerRef` receives the touches (must have `touch-action: none`);
// the transform is applied to `contentRef`.
export const usePinchZoom = (containerRef, contentRef, enabled = true) => {
  const state = useRef({ scale: 1, tx: 0, ty: 0, lastDist: 0, lastMid: null });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    // When disabled, make sure the video isn't left stuck mid-zoom.
    if (!enabled) {
      const content = contentRef.current;
      if (content) {
        state.current = { scale: 1, tx: 0, ty: 0, lastDist: 0, lastMid: null };
        content.style.transition = 'transform 0.2s ease-out';
        content.style.transform = 'translate(0px, 0px) scale(1)';
      }
      return undefined;
    }

    const apply = () => {
      const content = contentRef.current;
      if (!content) return;
      const { scale, tx, ty } = state.current;
      content.style.transformOrigin = '0 0';
      content.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    };

    const onMove = (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const dist = distance(e.touches[0], e.touches[1]);
      const mid = midpoint(e.touches[0], e.touches[1], rect);
      const s = state.current;

      if (!s.lastMid) {
        s.lastDist = dist;
        s.lastMid = mid;
        const content = contentRef.current;
        if (content) content.style.transition = 'none';
        return;
      }

      const newScale = Math.min(MAX_SCALE, Math.max(1, s.scale * (dist / s.lastDist)));
      s.tx = mid.x - (mid.x - s.tx) * (newScale / s.scale);
      s.ty = mid.y - (mid.y - s.ty) * (newScale / s.scale);
      s.tx += mid.x - s.lastMid.x;
      s.ty += mid.y - s.lastMid.y;
      s.scale = newScale;
      s.lastDist = dist;
      s.lastMid = mid;
      apply();
    };

    const onEnd = (e) => {
      if (e.touches.length >= 2) return;
      const s = state.current;
      s.lastDist = 0;
      s.lastMid = null;
      s.scale = 1;
      s.tx = 0;
      s.ty = 0;
      const content = contentRef.current;
      if (content) content.style.transition = 'transform 0.2s ease-out';
      apply();
    };

    // Listeners are bound natively with `{ passive: false }` because React
    // registers `touchmove` as passive, so `preventDefault` wouldn't work there.
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [containerRef, contentRef, enabled]);
};
