import React, { useRef } from 'react';

// grab the lens edges within this many pixels to resize it
const EDGE_GRAB = 12;
// the lens never gets narrower than this, in milliseconds
const MIN_VIEW = 10 * 1000;

const percent = (offset, duration) => `${(100 * offset) / duration}%`;

export function clampView(start, end, duration) {
  const width = Math.min(duration, Math.max(MIN_VIEW, end - start));
  const clampedStart = Math.min(Math.max(0, start), duration - width);
  return { start: clampedStart, end: clampedStart + width };
}

// The whole drive at a glance, with a lens marking the part the detail
// timeline below shows. Drag the lens to move it, drag its edges to zoom,
// tap elsewhere to bring it (and playback) there.
const Overview = ({ duration, view, selection, playheadRef, onViewChange, onSeek, children }) => {
  const barRef = useRef(null);
  const drag = useRef(null);

  const offsetAt = (clientX) => {
    const bounds = barRef.current.getBoundingClientRect();
    return (Math.max(0, Math.min(bounds.width, clientX - bounds.left)) / bounds.width) * duration;
  };

  const onPointerDown = (ev) => {
    if (ev.button !== 0) {
      return;
    }
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const bounds = barRef.current.getBoundingClientRect();
    const offset = offsetAt(ev.clientX);
    const edge = (EDGE_GRAB / bounds.width) * duration;
    if (Math.abs(offset - view.start) <= edge) {
      drag.current = { mode: 'start' };
    } else if (Math.abs(offset - view.end) <= edge) {
      drag.current = { mode: 'end' };
    } else if (offset > view.start && offset < view.end) {
      drag.current = { mode: 'move', grab: offset - view.start };
    } else {
      const width = view.end - view.start;
      onViewChange(clampView(offset - width / 2, offset + width / 2, duration));
      onSeek(offset);
      drag.current = { mode: 'move', grab: width / 2 };
    }
  };

  const onPointerMove = (ev) => {
    if (!drag.current) {
      return;
    }
    const offset = offsetAt(ev.clientX);
    const { mode, grab } = drag.current;
    if (mode === 'start') {
      onViewChange(clampView(Math.min(offset, view.end - MIN_VIEW), view.end, duration));
    } else if (mode === 'end') {
      onViewChange(clampView(view.start, Math.max(offset, view.start + MIN_VIEW), duration));
    } else {
      const width = view.end - view.start;
      onViewChange(clampView(offset - grab, offset - grab + width, duration));
    }
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div
      ref={barRef}
      role="presentation"
      className="relative h-5 w-full cursor-pointer touch-none select-none overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="absolute inset-x-0 top-1 h-3">{children}</div>
      {selection && (
        <div
          className="absolute inset-y-0 bg-white/25"
          style={{ left: percent(selection.start, duration), width: percent(selection.end - selection.start, duration) }}
        />
      )}
      <div ref={playheadRef} className="pointer-events-none absolute inset-y-0 w-px bg-white" />
      <div
        className="pointer-events-none absolute inset-y-0 rounded-sm border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
        style={{ left: percent(view.start, duration), width: percent(view.end - view.start, duration) }}
      />
    </div>
  );
};

export default Overview;
