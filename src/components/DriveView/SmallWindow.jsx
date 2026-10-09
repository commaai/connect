import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// the narrowest a small window gets, as a share of the frame's width
const MIN_WIDTH = 0.2;
// how far a press on the window itself moves before it drags the window rather than taps it, in pixels
const DRAG_THRESHOLD = 4;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const CORNER_CLASSES = {
  'top-left': 'left-0 top-0 cursor-nwse-resize rounded-tl-lg border-l-4 border-t-4',
  'top-right': 'right-0 top-0 cursor-nesw-resize rounded-tr-lg border-r-4 border-t-4',
  'bottom-left': 'bottom-0 left-0 cursor-nesw-resize rounded-bl-lg border-b-4 border-l-4',
  'bottom-right': 'bottom-0 right-0 cursor-nwse-resize rounded-br-lg border-b-4 border-r-4',
};

function loadBox(key) {
  try {
    const box = JSON.parse(window.localStorage.getItem(key));
    return box && [box.left, box.top, box.width].every(Number.isFinite) ? box : null;
  } catch {
    return null;
  }
}

function saveBox(key, box) {
  try {
    window.localStorage.setItem(key, JSON.stringify(box));
  } catch {
    // not remembered, e.g. in a private window
  }
}

// Holds the video or the map. When `small`, it is a window over the frame that can be moved
// by its bottom bar (or, with `dragAnywhere`, by any part of it), resized from its corner facing
// the middle of the frame, and closed; where it is and how big are remembered as shares of the
// frame. The children stay mounted either way, so the video keeps playing and the map keeps its state.
const SmallWindow = ({
  small, dragAnywhere, storageKey, aspect, fullClassName, smallClassName, defaultClassName,
  closeLabel, onClose, children,
}) => {
  const ref = useRef(null);
  const gesture = useRef(null);
  const latest = useRef(null);
  const settings = useRef(null);
  settings.current = { aspect, storageKey };
  const [box, setBox] = useState(() => loadBox(storageKey));
  const [corner, setCorner] = useState('bottom-right');

  // resize from the corner facing the middle of the frame, wherever the window has been put
  const placeResizeCorner = () => {
    const frame = ref.current.parentElement.getBoundingClientRect();
    const win = ref.current.getBoundingClientRect();
    const right = win.left + (win.width / 2) > frame.left + (frame.width / 2);
    const bottom = win.top + (win.height / 2) > frame.top + (frame.height / 2);
    setCorner(`${bottom ? 'top' : 'bottom'}-${right ? 'left' : 'right'}`);
  };
  useLayoutEffect(() => {
    if (small && !gesture.current) {
      placeResizeCorner();
    }
  });

  // the window follows the pointer anywhere on the page until it is released
  const onWindowPointerMove = (ev) => {
    const g = gesture.current;
    if (!g || ev.pointerId !== g.pointerId) {
      return;
    }
    const { aspect: ratio } = settings.current;
    const { frame, win } = g;
    const dx = ev.clientX - g.x;
    const dy = ev.clientY - g.y;
    if (!g.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        return;
      }
      g.dragging = true;
    }
    // relative to the frame, in pixels
    const winLeft = win.left - frame.left;
    const winTop = win.top - frame.top;
    let left = winLeft;
    let top = winTop;
    let { width } = win;
    if (g.mode === 'move') {
      left = clamp(winLeft + dx, 0, frame.width - win.width);
      top = clamp(winTop + dy, 0, frame.height - win.height);
    } else {
      // the opposite corner stays put, and the window keeps its shape inside the frame
      const fromLeft = g.corner.endsWith('left');
      const fromTop = g.corner.startsWith('top');
      const anchorX = fromLeft ? winLeft + win.width : winLeft;
      const anchorY = fromTop ? winTop + win.height : winTop;
      const grow = Math.max(fromLeft ? -dx : dx, (fromTop ? -dy : dy) * ratio);
      const maxWidth = Math.min(fromLeft ? anchorX : frame.width - anchorX, (fromTop ? anchorY : frame.height - anchorY) * ratio);
      width = clamp(win.width + grow, MIN_WIDTH * frame.width, maxWidth);
      left = fromLeft ? anchorX - width : anchorX;
      top = fromTop ? anchorY - (width / ratio) : anchorY;
    }
    latest.current = { left: left / frame.width, top: top / frame.height, width: width / frame.width };
    setBox(latest.current);
  };

  const onWindowPointerUp = (ev) => {
    const g = gesture.current;
    if (!g || ev.pointerId !== g.pointerId) {
      return;
    }
    g.stop();
    if (g.dragging && latest.current) {
      saveBox(settings.current.storageKey, latest.current);
      placeResizeCorner();
    }
  };

  const stopTracking = () => {
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerUp);
    gesture.current = null;
  };

  // let go of the page if the window goes away mid-gesture
  useEffect(() => () => gesture.current?.stop(), []);

  // The bottom bar and the resize corner take the press for themselves. A press on the window
  // itself is left to what is inside, like the video's double tap, until it moves.
  const onPointerDown = (mode) => (ev) => {
    if (ev.button !== 0 || gesture.current || (mode === 'body' && ev.target.closest('button'))) {
      return;
    }
    if (mode !== 'body') {
      ev.preventDefault();
      ev.stopPropagation();
    }
    gesture.current = {
      mode: mode === 'resize' ? 'resize' : 'move',
      corner,
      dragging: false,
      pointerId: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      frame: ref.current.parentElement.getBoundingClientRect(),
      win: ref.current.getBoundingClientRect(),
      stop: stopTracking,
    };
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
  };

  let className = fullClassName;
  let style;
  let windowHandlers = {};
  if (small) {
    className = `${smallClassName} ${box ? '' : defaultClassName} ${dragAnywhere ? 'cursor-move touch-none select-none' : ''}`;
    style = box ? { left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%` } : undefined;
    if (dragAnywhere) {
      windowHandlers = { onPointerDown: onPointerDown('body') };
    }
  }

  return (
    <div ref={ref} className={className} style={style} {...windowHandlers}>
      {children}
      {small && (
        <>
          <div
            aria-label="Move"
            className="absolute inset-x-0 bottom-0 z-[70] flex h-5 cursor-move touch-none items-center justify-center bg-gradient-to-t from-black/60 to-transparent"
            onPointerDown={onPointerDown('move')}
          >
            <div className="h-1 w-8 rounded-full bg-white/70" />
          </div>
          <div
            aria-label="Resize"
            className={`absolute z-[80] h-8 w-8 touch-none border-white/80 ${CORNER_CLASSES[corner]}`}
            onPointerDown={onPointerDown('resize')}
          />
          <button
            type="button"
            aria-label={closeLabel}
            className={`absolute top-1 z-[85] flex h-7 w-7 items-center justify-center rounded-full border border-fuchsia-500 bg-black/70 text-base leading-none text-fuchsia-300 shadow hover:text-white ${corner === 'top-right' ? 'left-1' : 'right-1'}`}
            onClick={onClose}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
};

export default SmallWindow;
