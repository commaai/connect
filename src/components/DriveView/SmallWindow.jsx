import React, { useRef, useState } from 'react';

// the narrowest a small window gets, as a share of the frame's width
const MIN_WIDTH = 0.2;
// how far a press on the window itself moves before it drags the window rather than taps it, in pixels
const DRAG_THRESHOLD = 4;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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
  small, dragAnywhere, storageKey, aspect, resizeCorner, fullClassName, smallClassName, defaultClassName,
  closeLabel, onClose, children,
}) => {
  const ref = useRef(null);
  const gesture = useRef(null);
  const latest = useRef(null);
  const [box, setBox] = useState(() => loadBox(storageKey));

  // the bottom bar and the resize corner grab the pointer at once; the window itself only once
  // the press has moved, so taps still reach what is inside, like the video's double tap
  const onPointerDown = (mode) => (ev) => {
    if (ev.button !== 0 || gesture.current || (mode === 'body' && ev.target.closest('button'))) {
      return;
    }
    const grabbed = mode !== 'body';
    if (grabbed) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.currentTarget.setPointerCapture(ev.pointerId);
    }
    gesture.current = {
      mode: mode === 'resize' ? 'resize' : 'move',
      grabbed,
      element: ev.currentTarget,
      pointerId: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      frame: ref.current.parentElement.getBoundingClientRect(),
      win: ref.current.getBoundingClientRect(),
    };
  };

  const onPointerMove = (ev) => {
    const g = gesture.current;
    if (!g || ev.pointerId !== g.pointerId) {
      return;
    }
    const { frame, win } = g;
    const dx = ev.clientX - g.x;
    const dy = ev.clientY - g.y;
    if (!g.grabbed) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        return;
      }
      g.element.setPointerCapture(ev.pointerId);
      g.grabbed = true;
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
    } else if (resizeCorner === 'top-left') {
      // the bottom-right corner stays put
      const right = winLeft + win.width;
      const bottom = winTop + win.height;
      width = clamp(win.width + Math.max(-dx, -dy * aspect), MIN_WIDTH * frame.width, Math.min(right, bottom * aspect));
      left = right - width;
      top = bottom - (width / aspect);
    } else {
      // the top-left corner stays put
      const maxWidth = Math.min(frame.width - winLeft, (frame.height - winTop) * aspect);
      width = clamp(win.width + Math.max(dx, dy * aspect), MIN_WIDTH * frame.width, maxWidth);
    }
    latest.current = { left: left / frame.width, top: top / frame.height, width: width / frame.width };
    setBox(latest.current);
  };

  const onPointerUp = (ev) => {
    const g = gesture.current;
    if (!g || ev.pointerId !== g.pointerId) {
      return;
    }
    if (g.grabbed && latest.current) {
      saveBox(storageKey, latest.current);
    }
    gesture.current = null;
  };

  let className = fullClassName;
  let style;
  let windowHandlers = {};
  if (small) {
    className = `${smallClassName} ${box ? '' : defaultClassName} ${dragAnywhere ? 'cursor-move touch-none select-none' : ''}`;
    style = box ? { left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%` } : undefined;
    // moves and releases bubble up here from the bottom bar and the resize corner too
    windowHandlers = {
      onPointerDown: dragAnywhere ? onPointerDown('body') : undefined,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    };
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
            className={`absolute z-[80] h-6 w-6 touch-none ${resizeCorner === 'top-left'
              ? 'left-0 top-0 cursor-nwse-resize rounded-tl-lg border-l-[3px] border-t-[3px]'
              : 'bottom-0 right-0 cursor-nwse-resize rounded-br-lg border-b-[3px] border-r-[3px]'} border-white/80`}
            onPointerDown={onPointerDown('resize')}
          />
          <button
            type="button"
            aria-label={closeLabel}
            className="absolute right-1 top-1 z-[85] flex h-5 w-5 items-center justify-center rounded-full border border-fuchsia-500 bg-black/60 text-xs leading-none text-fuchsia-300 shadow hover:text-white"
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
