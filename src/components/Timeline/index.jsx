// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { useCallback, useEffect, useRef, useState } from 'react';
import useAnimationFrame, { useLatest } from '../../hooks/useAnimationFrame';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';
import dayjs from 'dayjs';

import Thumbnails from './thumbnails';
import theme from '../../theme';
import { pushTimelineRange } from '../../actions';
import Colors from '../../colors';
import { currentOffset } from '../../timeline';
import { seek } from '../../timeline/playback';
import { getSegmentNumber } from '../../utils';

const styles = () => ({
  base: {
    position: 'relative',
  },
  segments: {
    position: 'relative',
    left: '0px',
    width: '100%',
    overflow: 'hidden',
    height: 12,
  },
  segment: {
    position: 'absolute',
    height: 12,
    background: theme.palette.states.drivingBlue,
  },
  statusGradient: {
    background: 'linear-gradient(rgba(0, 0, 0, 0.0) 4%, rgba(255, 255, 255, 0.025) 10%, rgba(0, 0, 0, 0.1) 25%, rgba(0, 0, 0, 0.4))',
    height: 12,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    width: '100%',
    zIndex: 2,
  },
  segmentColor: {
    position: 'absolute',
    display: 'inline-block',
    height: 12,
    width: '100%',
    '&.active': {},
    '&.engage': {
      background: theme.palette.states.engagedGreen,
    },
    '&.overriding': {
      background: theme.palette.states.engagedGrey,
    },
    '&.alert': {
      '&.userPrompt': {
        background: theme.palette.states.alertOrange,
      },
      '&.critical': {
        background: theme.palette.states.alertRed,
      },
    },
    '&.bookmark, &.flag': {  // TODO: remove flag selector once 14 days expires old events caches
      background: theme.palette.states.userBookmark,
      zIndex: 1,
    },
  },
  thumbnails: {
    height: 20,
    width: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    '& > div': {
      display: 'inline-block',
    },
  },
  ruler: {
    backgroundColor: 'rgb(37, 51, 61)',
    touchAction: 'none',
    width: '100%',
    height: 44,
  },
  rulerRemaining: {
    backgroundColor: 'rgba(29, 34, 37, 0.9)',
    borderLeft: '1px solid #D8DDDF',
    position: 'absolute',
    left: 0,
    height: 44,
    opacity: 0.45,
    pointerEvents: 'none',
    width: '100%',
  },
  dragHighlight: {
    pointerEvents: 'none',
    background: 'rgba(255, 255, 255, 0.1)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.3)',
    borderRight: '1px solid rgba(255, 255, 255, 0.3)',
    position: 'absolute',
    height: 44,
  },
  hoverBead: {
    zIndex: 3,
    textAlign: 'center',
    borderRadius: 14,
    fontSize: '0.7em',
    padding: '3px 4px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    color: Colors.white,
    position: 'absolute',
    top: 83,
    left: 0,
    width: 80,
  },
});

const AlertStatusCodes = [
  'normal',
  'userPrompt',
  'critical',
];

function Timeline({ classes, hasRuler, className, route, thumbnailsVisible, zoomOverride, zoom: selectedZoom, offset, loop, dispatch }) {
  const zoom = zoomOverride || selectedZoom;
  const latest = useLatest({ route, zoom, offset, loop, dispatch });
  const rulerRef = useRef(null);
  const remainingRef = useRef(null);
  const thumbnailsRef = useRef(null);
  const pointerDrag = useRef(null);
  const pointerCleanup = useRef(() => {});
  const [dragging, setDragging] = useState(null);
  const [hoverX, setHoverX] = useState(null);
  const [thumbnail, setThumbnail] = useState({ width: 0, height: 0 });
  const percentToOffset = useCallback((percent) =>
    Math.max(0, Math.min(1, percent)) * (zoom.end - zoom.start) + zoom.start, [zoom]);
  const readOffset = () => currentOffset({ currentRoute: route, offset, zoom, loop });

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !thumbnailsRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setThumbnail({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(thumbnailsRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => pointerCleanup.current(), []);
  useEffect(() => {
    const ruler = rulerRef.current;
    if (!ruler) return;
    const stopTouch = (event) => event.stopPropagation();
    ruler.addEventListener('touchstart', stopTouch);
    return () => ruler.removeEventListener('touchstart', stopTouch);
  }, [hasRuler]);
  useAnimationFrame(() => {
    const position = Math.floor(readOffset());
    const percent = Math.max(0, Math.min(1, (position - zoom.start) / Math.max(1, zoom.end - zoom.start)));
    rulerRef.current?.setAttribute('aria-valuenow', String(position / 1000));
    rulerRef.current?.setAttribute('aria-valuetext', `${(position / 1000).toFixed(1)} seconds into the drive`);
    if (remainingRef.current?.parentElement) {
      remainingRef.current.style.left = `${Math.floor(10000 * percent) / 100}%`;
      remainingRef.current.style.width = `${100 - Math.floor(10000 * percent) / 100}%`;
    }
  });

  const cancelDrag = () => {
    pointerCleanup.current();
    pointerDrag.current = null;
    setDragging(null);
    setHoverX(null);
  };
  const movePointer = (event) => {
    if (!rulerRef.current) return;
    event.preventDefault();
    const bounds = rulerRef.current.getBoundingClientRect();
    const end = Math.max(bounds.x, Math.min(bounds.x + bounds.width, event.clientX));
    if (pointerDrag.current) {
      pointerDrag.current = [pointerDrag.current[0], end];
      setDragging(pointerDrag.current);
    }
    setHoverX(end);
  };
  const finishDrag = (event) => {
    if (event.button !== 3 && event.button !== 4) event.preventDefault();
    pointerCleanup.current();
    const drag = pointerDrag.current;
    pointerDrag.current = null;
    if (!drag || !rulerRef.current) return;
    setDragging(null);
    const { route: currentRoute, zoom: bounds, dispatch: send } = latest.current;
    const ruler = rulerRef.current.getBoundingClientRect();
    const at = (x) => Math.max(0, Math.min(1, (x - ruler.x) / ruler.width)) * (bounds.end - bounds.start) + bounds.start;
    if (Math.abs(drag[1] - drag[0]) > 3) {
      send(pushTimelineRange(currentRoute.log_id, Math.round(at(Math.min(...drag))), Math.round(at(Math.max(...drag))), true));
    } else send(seek(at(Math.min(...drag))));
  };
  const startDrag = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    pointerCleanup.current();
    const listeners = { pointerup: finishDrag, pointermove: movePointer, pointercancel: cancelDrag };
    for (const [type, callback] of Object.entries(listeners)) document.addEventListener(type, callback);
    pointerCleanup.current = () => {
      for (const [type, callback] of Object.entries(listeners)) document.removeEventListener(type, callback);
    };
    pointerDrag.current = [event.clientX, event.clientX];
    setDragging(pointerDrag.current);
  };
  const keyDown = (event) => {
    const position = readOffset();
    const step = event.shiftKey ? 10000 : 1000;
    const targets = { ArrowLeft: position - step, ArrowDown: position - step,
      ArrowRight: position + step, ArrowUp: position + step, Home: zoom.start, End: zoom.end };
    if (targets[event.key] == null) return;
    event.preventDefault();
    dispatch(seek(Math.max(zoom.start, Math.min(zoom.end, targets[event.key]))));
  };

  const ruler = rulerRef.current?.getBoundingClientRect();
  let hoverString;
  let hoverStyle;
  if (ruler && hoverX) {
    const hoverOffset = percentToOffset((hoverX - ruler.x) / ruler.width);
    if (!Number.isNaN(hoverOffset)) {
      const segment = getSegmentNumber(route, hoverOffset);
      const time = dayjs(route.start_time_utc_millis + hoverOffset).format('HH:mm:ss');
      hoverString = segment === null ? time : `${segment}, ${time}`;
      hoverStyle = { left: Math.max(-10, Math.min(ruler.width - 70, hoverX - ruler.x - 40)) };
    }
  }
  const dragStyle = ruler && dragging && Math.abs(dragging[1] - dragging[0]) > 0 ? {
    left: `${Math.min(...dragging) - ruler.x}px`, width: `${Math.abs(dragging[1] - dragging[0])}px`,
  } : null;
  const rulerClass = hasRuler ? 'hasRuler' : '';
  return (
    <div className={className}>
      <div role="presentation" className={`${classes.base} ${rulerClass}`} style={{ width: '100%' }}>
        <div className={`${classes.segments} ${rulerClass}`}>
          {route?.events && (
            <div className={classes.segment} style={{ width: `${100 * route.duration / (zoom.end - zoom.start)}%`, left: `${-100 * zoom.start / (zoom.end - zoom.start)}%` }}>
              {route.events.filter((event) => event.data?.end_route_offset_millis).map((event) => (
                <div key={route.fullname + event.route_offset_millis + event.type}
                  className={`${classes.segmentColor} ${event.type} ${event.data.alertStatus ? AlertStatusCodes[event.data.alertStatus] : ''}`}
                  style={{ left: `${event.route_offset_millis / route.duration * 100}%`, minWidth: '1px',
                    width: `${(event.data.end_route_offset_millis - event.route_offset_millis) / route.duration * 100}%` }} />
              ))}
            </div>
          )}
          <div className={`${classes.statusGradient} ${rulerClass}`} />
        </div>
        <div ref={thumbnailsRef} className={`${classes.thumbnails} ${rulerClass}`}>
          {thumbnailsVisible && <Thumbnails className={classes.thumbnail} currentRoute={route}
            percentToOffset={percentToOffset} thumbnail={thumbnail} hasRuler={hasRuler} />}
        </div>
        {hasRuler && <>
          <div aria-label="Drive timeline" role="slider" tabIndex={0}
            aria-valuemin={zoom.start / 1000} aria-valuemax={zoom.end / 1000} aria-valuenow={readOffset() / 1000}
            ref={rulerRef} className={classes.ruler} onKeyDown={keyDown} onPointerDown={startDrag}
            onPointerUp={finishDrag} onPointerMove={movePointer} onPointerCancel={cancelDrag} onPointerLeave={() => setHoverX(null)}>
            <div ref={remainingRef} className={classes.rulerRemaining} />
            {dragStyle && <div className={classes.dragHighlight} style={dragStyle} />}
          </div>
          {hoverString && <div className={classes.hoverBead} style={hoverStyle}>{hoverString}</div>}
        </>}
      </div>
    </div>
  );
}

const stateToProps = (state) => ({
  zoom: state.zoom,
  offset: state.offset,
  loop: state.loop,
});

export default connect(stateToProps)(withStyles(styles)(Timeline));
