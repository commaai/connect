import { useEffect, useRef, useState } from 'react';
import { isIos } from '../../utils/browser';

const DEFAULT_THRESHOLD = 80;
const DEFAULT_MAX_PULL = 120;
const DIRECTION_LOCK = 8;
const RUBBER_BAND = 0.55;

const pageIsScrollLocked = () => window.getComputedStyle(document.body).overflow === 'hidden';

const pullOffset = (distance, maxPull) => {
  const dimension = maxPull * 6;
  return Math.min(
    (distance * dimension * RUBBER_BAND) / (dimension + (distance * RUBBER_BAND)),
    maxPull,
  );
};

function CircularSpinner({ active, progress }) {
  const circumference = 2 * Math.PI * 7.5;
  const arcLength = circumference * (0.12 + (progress * 0.63));

  return (
    <svg
      className="h-5 w-5 overflow-visible"
      viewBox="0 0 20 20"
      style={{
        opacity: active ? 1 : 0.15 + (progress * 0.85),
        transform: `rotate(${active ? 180 : progress * 280 - 100}deg)`,
      }}
    >
      <g
        style={{
          transformOrigin: '10px 10px',
          animation: active ? 'circular-rotate 700ms linear infinite' : 'none',
        }}
      >
        <circle
          cx="10"
          cy="10"
          r="7.5"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${active ? circumference * 0.75 : arcLength} ${circumference}`}
        />
      </g>
    </svg>
  );
}

/**
 * iOS-style gesture lifecycle:
 *
 * tracking  Touch is held, but the document has not reached the top.
 * ready     The held touch reached the top; its current position is the pull origin.
 * pulling   Continued downward movement owns the gesture until touchend/cancel.
 *
 * Merely arriving at the top never displays or triggers refresh. The same held
 * touch must continue downward after reaching it.
 */
export default function PullToRefresh({
  children,
  threshold = DEFAULT_THRESHOLD,
  maxPull = DEFAULT_MAX_PULL,
  onRefresh,
  enabled = isIos() && window.navigator.standalone === true,
}) {
  const [distance, setDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [hasStartedSpinning, setHasStartedSpinning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const gesture = useRef(null);
  const refreshing = useRef(false);
  const reloadTimer = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const clearGesture = () => {
      gesture.current = null;
      setIsPulling(false);
      setHasStartedSpinning(false);
      setDistance(0);
    };

    const handleTouchStart = (event) => {
      if (refreshing.current || pageIsScrollLocked() || event.touches.length !== 1) return;

      const touch = event.touches[0];
      gesture.current = {
        phase: window.scrollY <= 0 ? 'ready' : 'tracking',
        originX: touch.clientX || 0,
        originY: touch.clientY,
        lastX: touch.clientX || 0,
        lastY: touch.clientY,
        direction: null,
        distance: 0,
        armed: false,
      };
    };

    const handleTouchMove = (event) => {
      const current = gesture.current;
      if (!current || event.touches.length !== 1) return;
      if (pageIsScrollLocked()) {
        clearGesture();
        return;
      }

      const touch = event.touches[0];
      const x = touch.clientX || 0;
      const y = touch.clientY;

      if (current.phase === 'tracking') {
        if (window.scrollY > 0) {
          current.lastX = x;
          current.lastY = y;
          return;
        }

        // Anchor to the last observed finger position. Any distance in this
        // event is movement beyond the point where the page reached the top.
        current.phase = 'ready';
        current.originX = current.lastX;
        current.originY = current.lastY;
        current.direction = null;
      }

      const deltaX = x - current.originX;
      const deltaY = y - current.originY;

      if (current.phase === 'ready') {
        if (window.scrollY > 0) {
          current.phase = 'tracking';
          current.lastX = x;
          current.lastY = y;
          return;
        }

        if (!current.direction
            && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= DIRECTION_LOCK) {
          current.direction = Math.abs(deltaY) > Math.abs(deltaX) ? 'vertical' : 'horizontal';
        }

        if (current.direction !== 'vertical' || deltaY <= 0) return;
        current.phase = 'pulling';
        setIsPulling(true);
      }

      if (current.phase !== 'pulling') return;

      current.distance = pullOffset(Math.max(0, deltaY), maxPull);
      current.armed = current.distance >= threshold;
      if (current.armed) {
        setHasStartedSpinning(true);
      }
      setDistance(current.distance);
      current.lastX = x;
      current.lastY = y;
      event.preventDefault();
    };

    const handleScroll = () => {
      const current = gesture.current;
      if (!current || current.phase !== 'tracking' || window.scrollY > 0) return;

      // The scroll event is the authoritative notification that WebKit has
      // committed the asynchronous scroll position. It does not matter whether
      // it runs before or after the neighboring touchmove.
      current.phase = 'ready';
      current.originX = current.lastX;
      current.originY = current.lastY;
      current.direction = null;
    };

    const handleTouchEnd = () => {
      const shouldRefresh = gesture.current?.phase === 'pulling'
        && gesture.current.armed;
      clearGesture();
      if (!shouldRefresh) return;

      refreshing.current = true;
      setIsRefreshing(true);

      if (onRefresh) {
        Promise.resolve()
          .then(onRefresh)
          .finally(() => {
            refreshing.current = false;
            setIsRefreshing(false);
          });
      } else {
        reloadTimer.current = window.setTimeout(() => window.location.reload(), 400);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', clearGesture, { passive: true, capture: true });
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('touchmove', handleTouchMove, true);
      document.removeEventListener('touchend', handleTouchEnd, true);
      document.removeEventListener('touchcancel', clearGesture, true);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [enabled, maxPull, onRefresh, threshold]);

  if (!enabled) return children || null;

  const offset = isRefreshing ? threshold : distance;
  const progress = Math.min(offset / threshold, 1);
  const visible = offset > 3;

  return (
    <div className="relative flex min-h-screen flex-1 flex-col overflow-clip">
      <div
        className="pointer-events-none absolute inset-x-0 z-0 flex items-center justify-center"
        style={{
          top: Math.max(4, (offset - 20) / 2),
          opacity: visible ? 1 : 0,
          transition: isPulling ? 'none' : 'top 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms ease-out',
        }}
        aria-hidden={!visible}
      >
        <CircularSpinner active={hasStartedSpinning || isRefreshing} progress={progress} />
        <span className="sr-only" role="status">
          {isRefreshing ? 'Refreshing' : 'Pull to refresh'}
        </span>
      </div>
      <div
        className="relative z-10 flex min-h-screen flex-1 flex-col bg-[#1D2225]"
        style={{
          transform: offset > 0 ? `translateY(${offset}px)` : 'none',
          transition: isPulling ? 'none' : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
